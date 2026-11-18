import type { HistoryItem } from "./types";

/** 解析后的可渲染地址；objectURL 需要在使用方卸载时调用 revoke 回收。 */
export interface ResolvedImage {
  src: string;
  revoke?: () => void;
}

export type SaveImageResult = "saved" | "cancelled" | "fallback";

/**
 * 历史记录与图片副本的存储抽象。
 * web 端由 IndexedDB 实现，桌面端将替换为文件系统 / SQLite。
 */
export interface HistoryStore {
  load(): Promise<HistoryItem[]>;
  save(items: HistoryItem[]): Promise<void>;
  putImage(key: string, blob: Blob): Promise<void>;
  getImage(key: string): Promise<Blob | null>;
  deleteImage(imageRef: string): Promise<void>;
  /**
   * 把外部链接的图片抓成 blob 落本地，成功返回可持久化的新引用。
   * 失败（跨域、链接过期）返回 null，调用方继续沿用原链接。
   */
  captureRemote(url: string, key: string): Promise<string | null>;
}

/**
 * 唯一的平台差异入口，由 `@platform` 别名在构建时决定具体实现。
 * 新增平台能力时先在这里加签名，再分别实现 web / desktop。
 */
export interface PlatformApi {
  readonly target: "web" | "desktop";
  readonly historyStore: HistoryStore;
  /** 无需异步解析的地址（http / data / blob）直接返回，否则返回 null */
  directImageSrc(imageRef: string): string | null;
  resolveImageSrc(imageRef: string): Promise<ResolvedImage | null>;
  saveImage(imageRef: string, filename: string): Promise<SaveImageResult>;
}
