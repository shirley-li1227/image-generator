import type { PlatformApi } from "../../services/platform";
import { platform as webPlatform } from "../web";

/**
 * 桌面端（Tauri / Electron）接入点，`vite build --mode desktop` 时替换 web 实现。
 *
 * P1 需要按顺序替换这三项，业务代码与 UI 不用改：
 *   historyStore    → 文件系统 / SQLite（元数据 + 图片副本落 appDataDir）
 *   resolveImageSrc → convertFileSrc / 自定义协议读取本地图片
 *   saveImage       → 原生保存对话框 + 直接写盘
 *
 * 替换完成前先复用 web 实现，保证 desktop 构建可正常运行。
 */
export const platform: PlatformApi = {
  ...webPlatform,
  target: "desktop",
};
