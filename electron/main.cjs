const path = require("node:path");
const fs = require("node:fs/promises");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
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

function registerAppProtocol() {
  const rootDir = rendererDir();

  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const relativePath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
    const filePath = path.normalize(path.join(rootDir, relativePath));

    // 阻断 ../ 越界读取
    if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const data = await fs.readFile(filePath);
      const contentType =
        MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      return new Response(data, { headers: { "content-type": contentType } });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}

function registerIpcHandlers() {
  ipcMain.handle("image:save", async (event, payload) => {
    const data = payload?.data;
    const filename = typeof payload?.filename === "string" ? payload.filename : "";
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      return { status: "failed", message: "图片数据为空" };
    }

    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const { canceled, filePath } = await dialog.showSaveDialog(owner, {
      title: "保存图片",
      defaultPath: path.join(app.getPath("downloads"), path.basename(filename || "ai-image.png")),
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (canceled || !filePath) return { status: "cancelled" };

    try {
      await fs.writeFile(filePath, Buffer.from(data));
      return { status: "saved", filePath };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : "写入失败" };
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

  app.whenReady().then(() => {
    if (!DEV_SERVER_URL) registerAppProtocol();
    registerIpcHandlers();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
