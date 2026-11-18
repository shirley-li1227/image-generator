export type ImageStyle = "realistic" | "anime";

export type ImageSize = "1024x1024" | "768x1344" | "1344x768";

export const DEFAULT_IMAGE_SIZE: ImageSize = "1024x1024";

export const DEFAULT_IMAGE_STYLE: ImageStyle = "realistic";

export interface HistoryItem {
  id: string;
  prompt: string;
  /**
   * 图片引用。web 端为 IndexedDB 中的图片 key（也兼容迁移前遗留的 http 外链），
   * 桌面端接入后为本地文件路径。
   */
  imageRef: string;
  createdAt: number;
  size: ImageSize;
  style: ImageStyle;
}
