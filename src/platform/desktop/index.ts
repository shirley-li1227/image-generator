import type { PlatformApi } from "../../services/platform";
import { platform as webPlatform } from "../web";
import { historyStore } from "./historyStore";
import { directImageSrc, resolveImageSrc } from "./imageSrc";
import { saveImage } from "./saveImage";

/**
 * 桌面端（Electron）实现：
 *   historyStore    → userData/history.json + userData/images/<id>.png，经 preload IPC 访问
 *   resolveImageSrc → app://images/<id>.png 由主进程协议处理器提供
 *   saveImage       → 原生保存对话框 + 直接写盘
 * 未注入 preload 时各实现内部会回退到 web 版本，方便浏览器调试。
 */
export const platform: PlatformApi = {
  ...webPlatform,
  target: "desktop",
  historyStore,
  directImageSrc,
  resolveImageSrc,
  saveImage,
};
