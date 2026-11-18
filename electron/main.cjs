const path = require("node:path");
const fs = require("node:fs/promises");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} = require("electron");

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * 用自定义协议加载构建产物。
 * file:// 下 Chromium 不提供 IndexedDB，历史记录会失效，所以注册为 standard + secure 协议。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function rendererDir() {
  return path.join(app.getAppPath(), "dist");
}

function historyFile() {
  return path.join(app.getPath("userData"), "history.json");
}

function imagesDir() {
  return path.join(app.getPath("userData"), "images");
}

const IMAGE_REF_PREFIX = "app://images/";
const IMAGE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_CAPTURE_BYTES = 25 * 1024 * 1024;
const ORPHAN_GRACE_MS = 10 * 60 * 1000;

function isValidKey(key) {
  return (
    typeof key === "string" &&
    IMAGE_KEY_PATTERN.test(key) &&
    !key.includes("..")
  );
}

function imagePath(key) {
  return path.join(imagesDir(), `${key}.png`);
}

function isHistoryItemLike(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.imageRef === "string"
  );
}

async function pruneOrphanImages(items) {
  let entries = [];
  try {
    entries = await fs.readdir(imagesDir());
  } catch {
    return;
  }

  // 记录中引用的、以及 id 对应的文件都保留（后台转存可能还没更新引用）
  const keep = new Set();
  for (const item of items) {
    keep.add(`${item.id}.png`);
    if (item.imageRef.startsWith(IMAGE_REF_PREFIX)) {
      keep.add(path.basename(item.imageRef));
    }
  }

  // 只清理超过宽限期的孤儿文件，避免误删正在写入的图片
  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  for (const entry of entries) {
    if (keep.has(entry)) continue;
    const filePath = path.join(imagesDir(), entry);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) await fs.unlink(filePath);
    } catch {
      // 忽略单个文件的清理失败
    }
  }
}

function registerAppProtocol() {
  const rendererRoot = rendererDir();

  protocol.handle("app", async (request) => {
    const { hostname, pathname } = new URL(request.url);
    // app://images/<id>.png 由本地图片目录提供，其余走前端产物
    const isImage = hostname === "images";
    const rootDir = isImage ? imagesDir() : rendererRoot;
    const fallback = isImage
      ? pathname
      : pathname === "/"
        ? "/index.html"
        : pathname;
    const relativePath = decodeURIComponent(fallback);
    const filePath = path.normalize(path.join(rootDir, relativePath));

    // 阻断 ../ 越界读取
    if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const data = await fs.readFile(filePath);
      const contentType =
        MIME_TYPES[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream";
      return new Response(data, { headers: { "content-type": contentType } });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}

function registerHistoryHandlers() {
  // 返回 null 表示本地还没有历史文件（首次启动），便于渲染层做一次性迁移
  ipcMain.handle("history:load", async () => {
    try {
      const raw = await fs.readFile(historyFile(), "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const items = parsed.filter(isHistoryItemLike);

      // 本地已有同名图片副本时，把遗留外链引用补成本地引用
      return await Promise.all(
        items.map(async (item) => {
          if (item.imageRef.startsWith("app://")) return item;
          try {
            await fs.access(imagePath(item.id));
            return { ...item, imageRef: `${IMAGE_REF_PREFIX}${item.id}.png` };
          } catch {
            return item;
          }
        }),
      );
    } catch (error) {
      if (error.code === "ENOENT") return null;
      console.warn("[history] 读取历史记录失败", error);
      return [];
    }
  });

  ipcMain.handle("history:save", async (_event, items) => {
    if (!Array.isArray(items)) return { ok: false, message: "参数不是数组" };
    const safeItems = items.filter(isHistoryItemLike).slice(0, 100);
    try {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      const target = historyFile();
      const temp = `${target}.tmp`;
      await fs.writeFile(temp, JSON.stringify(safeItems, null, 2), "utf8");
      await fs.rename(temp, target);
      await pruneOrphanImages(safeItems);
      return { ok: true };
    } catch (error) {
      console.warn("[history] 保存历史记录失败", error);
      return { ok: false, message: error.message };
    }
  });

  ipcMain.handle("image:write", async (_event, payload) => {
    const key = payload?.key;
    const data = payload?.data;
    if (
      !isValidKey(key) ||
      !(data instanceof Uint8Array) ||
      data.byteLength === 0
    ) {
      return { ok: false };
    }
    try {
      await fs.mkdir(imagesDir(), { recursive: true });
      await fs.writeFile(imagePath(key), Buffer.from(data));
      return { ok: true };
    } catch (error) {
      console.warn("[history] 写入图片副本失败", error);
      return { ok: false };
    }
  });

  ipcMain.handle("image:delete", async (_event, key) => {
    if (!isValidKey(key)) return { ok: false };
    try {
      await fs.unlink(imagePath(key));
      return { ok: true };
    } catch (error) {
      return { ok: error.code === "ENOENT" };
    }
  });

  // 主进程抓取外链不受 CORS 限制，渲染层抓不下来的图片在这里兜底
  ipcMain.handle("image:captureRemote", async (_event, payload) => {
    const url = payload?.url;
    const key = payload?.key;
    if (
      !isValidKey(key) ||
      typeof url !== "string" ||
      !/^https?:\/\//i.test(url)
    ) {
      return null;
    }
    try {
      const response = await net.fetch(url);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_CAPTURE_BYTES)
        return null;
      await fs.mkdir(imagesDir(), { recursive: true });
      await fs.writeFile(imagePath(key), buffer);
      return `${IMAGE_REF_PREFIX}${key}.png`;
    } catch (error) {
      console.warn("[history] 转存外链图片失败", error);
      return null;
    }
  });
}

function registerIpcHandlers() {
  ipcMain.handle("image:save", async (event, payload) => {
    const data = payload?.data;
    const filename =
      typeof payload?.filename === "string" ? payload.filename : "";
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      return { status: "failed", message: "图片数据为空" };
    }

    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const { canceled, filePath } = await dialog.showSaveDialog(owner, {
      title: "保存图片",
      defaultPath: path.join(
        app.getPath("downloads"),
        path.basename(filename || "ai-image.png"),
      ),
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (canceled || !filePath) return { status: "cancelled" };

    try {
      await fs.writeFile(filePath, Buffer.from(data));
      return { status: "saved", filePath };
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "写入失败",
      };
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "AI 图片生成器",
    backgroundColor: "#020617",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadURL("app://-/index.html");
  }

  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    if (!DEV_SERVER_URL) registerAppProtocol();
    registerIpcHandlers();
    registerHistoryHandlers();
    await fs.mkdir(imagesDir(), { recursive: true }).catch(() => undefined);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
