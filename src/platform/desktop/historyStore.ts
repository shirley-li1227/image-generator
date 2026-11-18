import type { HistoryStore } from "../../services/platform";
import type { HistoryItem } from "../../services/types";
import { historyStore as webHistoryStore } from "../web/historyStore";
import { imageRefForKey, keyFromImageRef } from "./imageRefs";

function bridge() {
  return window.desktop?.history;
}

/**
 * 桌面端历史存储：元数据落 userData/history.json，图片副本落 userData/images/<id>.png。
 * 未注入 preload（例如用 desktop 构建在浏览器里调试）时回退到 IndexedDB 实现。
 */
export const historyStore: HistoryStore = {
  async load() {
    const api = bridge();
    if (!api) return webHistoryStore.load();

    try {
      const stored = await api.load();
      if (stored) return stored;
      // 首次从旧版 IndexedDB 升级：一次性把记录和图片副本搬到文件存储
      return await migrateFromIndexedDb(api);
    } catch {
      return webHistoryStore.load();
    }
  },

  async save(items) {
    const api = bridge();
    if (!api) {
      await webHistoryStore.save(items);
      return;
    }
    await api.save(items).catch(() => undefined);
  },

  async putImage(key, blob) {
    const api = bridge();
    if (!api) {
      await webHistoryStore.putImage(key, blob);
      return;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await api.putImage(key, bytes).catch(() => undefined);
  },

  async getImage(key) {
    if (!bridge()) return webHistoryStore.getImage(key);
    try {
      const response = await fetch(imageRefForKey(key));
      if (!response.ok) return null;
      return await response.blob();
    } catch {
      return null;
    }
  },

  async deleteImage(imageRef) {
    const key = keyFromImageRef(imageRef);
    if (!key) return;

    const api = bridge();
    if (!api) {
      await webHistoryStore.deleteImage(key);
      return;
    }
    await api.deleteImage(key).catch(() => undefined);
  },

  async captureRemote(url, key) {
    const api = bridge();
    if (!api) return null;
    try {
      return await api.captureRemote(url, key);
    } catch {
      return null;
    }
  },
};

/** 旧版桌面壳用的是 IndexedDB，升级后把内容搬到文件存储，避免历史丢失 */
async function migrateFromIndexedDb(
  api: NonNullable<ReturnType<typeof bridge>>,
): Promise<HistoryItem[]> {
  const legacy = await webHistoryStore.load();
  if (legacy.length === 0) {
    await api.save([]);
    return [];
  }

  const migrated: HistoryItem[] = [];
  for (const item of legacy) {
    if (/^https?:\/\//i.test(item.imageRef)) {
      migrated.push(item);
      continue;
    }
    const blob = await webHistoryStore.getImage(item.imageRef);
    if (!blob) continue;
    const written = await api.putImage(
      item.id,
      new Uint8Array(await blob.arrayBuffer()),
    );
    if (!written.ok) continue;
    migrated.push({ ...item, imageRef: imageRefForKey(item.id) });
  }

  await api.save(migrated);
  return migrated;
}
