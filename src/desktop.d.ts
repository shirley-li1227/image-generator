export interface DesktopSaveResult {
  status: "saved" | "cancelled" | "failed";
  filePath?: string;
  message?: string;
}

declare global {
  interface Window {
    /** Electron preload 注入，仅桌面端存在 */
    desktop?: {
      saveImage: (bytes: Uint8Array, filename: string) => Promise<DesktopSaveResult>;
    };
  }
}
