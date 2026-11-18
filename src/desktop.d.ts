import type { HistoryItem } from "./services/types";

export interface DesktopSaveResult {
  status: "saved" | "cancelled" | "failed";
  filePath?: string;
  message?: string;
}

export interface DesktopResult {
  ok: boolean;
  message?: string;
}

export interface DesktopHistoryApi {
  /** null 表示本地还没有历史文件（首次启动） */
  load: () => Promise<HistoryItem[] | null>;
  save: (items: HistoryItem[]) => Promise<DesktopResult>;
  putImage: (key: string, bytes: Uint8Array) => Promise<DesktopResult>;
  deleteImage: (key: string) => Promise<DesktopResult>;
  /** 主进程抓取外链图片落盘，成功返回 app:// 引用 */
  captureRemote: (url: string, key: string) => Promise<string | null>;
}

declare global {
  interface Window {
    /** Electron preload 注入，仅桌面端存在 */
    desktop?: {
      saveImage: (
        bytes: Uint8Array,
        filename: string,
      ) => Promise<DesktopSaveResult>;
      history: DesktopHistoryApi;
    };
  }
}
