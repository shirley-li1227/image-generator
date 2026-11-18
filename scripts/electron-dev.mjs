import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const devUrl = "http://localhost:1420";
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");

/**
 * 同时拉起 Vite（--mode desktop，固定 1420 端口）与 Electron。
 * 不引入额外依赖，避免给 web 构建链路加负担。
 */
const vite = spawn(process.execPath, [viteBin, "--mode", "desktop"], {
  cwd: rootDir,
  stdio: "inherit",
});

let electron = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && electron.exitCode === null) electron.kill();
  if (vite.exitCode === null) vite.kill("SIGTERM");
  process.exit(code);
}

async function waitForServer(url, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // 端口还没监听，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

if (!(await waitForServer(devUrl))) {
  console.error(`[electron] Vite 未能在超时内启动：${devUrl}`);
  shutdown(1);
}

electron = spawn(electronBinary, [rootDir], {
  cwd: rootDir,
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RENDERER_URL: devUrl },
});

electron.on("exit", (code) => shutdown(code ?? 0));
vite.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
