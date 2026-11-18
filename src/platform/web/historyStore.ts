import type { HistoryStore } from "../../services/platform";
import type { HistoryItem, ImageSize, ImageStyle } from "../../services/types";

const DB_NAME = "image-generator";
const DB_VERSION = 1;
const META_STORE = "meta";
const IMAGE_STORE = "images";
const META_HISTORY_KEY = "history";
/** P0 之前历史只存了外链，首次启动时迁移到这里 */
const LEGACY_STORAGE_KEY = "ai-image-generator-history-v2";
const REMOTE_CAPTURE_TIMEOUT_MS = 15_000;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE))
        db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(IMAGE_STORE))
        db.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开 IndexedDB"));
  });
  return dbPromise;
}

async function requestFromStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  pick: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await getDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = pick(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB 操作失败"));
  });
}

function readMeta(): Promise<HistoryItem[] | undefined> {
  return requestFromStore<HistoryItem[] | undefined>(
    META_STORE,
    "readonly",
    (store) => store.get(META_HISTORY_KEY),
  );
}

function writeMeta(items: HistoryItem[]): Promise<IDBValidKey> {
  return requestFromStore<IDBValidKey>(META_STORE, "readwrite", (store) =>
    store.put(items, META_HISTORY_KEY),
  );
}

function writeImage(key: string, blob: Blob): Promise<IDBValidKey> {
  return requestFromStore<IDBValidKey>(IMAGE_STORE, "readwrite", (store) =>
    store.put(blob, key),
  );
}

async function readImage(key: string): Promise<Blob | null> {
  const blob = await requestFromStore<Blob | undefined>(
    IMAGE_STORE,
    "readonly",
    (store) => store.get(key),
  );
  return blob ?? null;
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function fetchBlob(url: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_CAPTURE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    // 跨域外链读不出内容时保留原链接，渲染层会继续按直链显示
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function captureIntoStore(url: string, key: string): Promise<boolean> {
  const blob = await fetchBlob(url);
  if (!blob) return false;
  try {
    await writeImage(key, blob);
    return true;
  } catch {
    return false;
  }
}

function readLegacyItems(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) =>
        entry && typeof entry === "object"
          ? normalizeItem(entry as Record<string, unknown>)
          : null,
      )
      .filter((item): item is HistoryItem => item !== null);
  } catch {
    return [];
  }
}

function normalizeItem(raw: Record<string, unknown>): HistoryItem | null {
  const imageRef =
    typeof raw.imageRef === "string"
      ? raw.imageRef
      : typeof raw.imageUrl === "string"
        ? raw.imageUrl
        : "";
  if (!imageRef) return null;
  return {
    id:
      typeof raw.id === "string" && raw.id
        ? raw.id
        : `legacy-${Math.random().toString(16).slice(2)}`,
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    imageRef,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    size: normalizeSize(raw.size),
    style: normalizeStyle(raw.style),
  };
}

function normalizeSize(value: unknown): ImageSize {
  return value === "768x1344" || value === "1344x768" ? value : "1024x1024";
}

function normalizeStyle(value: unknown): ImageStyle {
  return value === "anime" ? "anime" : "realistic";
}

async function migrateLegacy(): Promise<HistoryItem[]> {
  const legacy = readLegacyItems();
  if (legacy.length === 0) return [];
  try {
    await writeMeta(legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.warn("[history] 迁移旧记录失败", error);
  }
  // 后台把旧记录的外链抓成本地副本；失败也不影响使用，仍按原链接渲染
  void Promise.allSettled(
    legacy
      .filter((item) => isRemoteUrl(item.imageRef))
      .map((item) => captureIntoStore(item.imageRef, item.id)),
  );
  return legacy;
}

/** 后台转存过的外链图片在本地有副本时，优先用本地副本，避免临时链接过期后裂图 */
async function attachLocalCopies(items: HistoryItem[]): Promise<HistoryItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!isRemoteUrl(item.imageRef)) return item;
      const cached = await readImage(item.id).catch(() => null);
      return cached ? { ...item, imageRef: item.id } : item;
    }),
  );
}

export const historyStore: HistoryStore = {
  async load() {
    try {
      const stored = await readMeta();
      if (Array.isArray(stored) && stored.length > 0) {
        return await attachLocalCopies(stored);
      }
      // 新库为空时再尝试从旧版 localStorage 迁移，避免漏掉降级/重装场景的旧记录
      const migrated = await migrateLegacy();
      return await attachLocalCopies(
        migrated.length > 0 ? migrated : (stored ?? []),
      );
    } catch (error) {
      console.warn(
        "[history] IndexedDB 不可用，本次仅读取旧版 localStorage 记录",
        error,
      );
      return readLegacyItems();
    }
  },

  async save(items) {
    try {
      await writeMeta(items);
    } catch (error) {
      console.warn("[history] 保存历史记录失败", error);
    }
  },

  async putImage(key, blob) {
    await writeImage(key, blob);
  },

  async getImage(key) {
    try {
      return await readImage(key);
    } catch {
      return null;
    }
  },

  async deleteImage(imageRef) {
    if (!imageRef || isRemoteUrl(imageRef)) return;
    await requestFromStore<undefined>(IMAGE_STORE, "readwrite", (store) =>
      store.delete(imageRef),
    ).catch(() => undefined);
  },

  async captureRemote(url, key) {
    const captured = await captureIntoStore(url, key);
    return captured ? key : null;
  },
};
