import type { PlatformApi } from "../../services/platform";
import { platform as webPlatform } from "../web";
import { saveImage } from "./saveImage";

/**
 * 桌面端（Electron）接入点，`vite build --mode desktop` 时替换 web 实现。
 *
 * 已接入：saveImage → preload 暴露的原生保存对话框 + 直接写盘。
 * 待接入（P2）：historyStore → 文件系统 / SQLite（元数据 + 图片副本落 appDataDir）。
 * 当前存储复用 IndexedDB，Electron 下由 Chromium 持久化在 userData 目录。
 */
export const platform: PlatformApi = {
  ...webPlatform,
  target: "desktop",
  saveImage,
};
