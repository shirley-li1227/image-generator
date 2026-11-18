import type { SaveImageResult } from "../../services/platform";
import { saveImage as saveImageInBrowser } from "../web/downloadImage";

/**
 * 桌面端保存：优先走 preload 暴露的原生保存对话框，由主进程直接写盘。
 * 拿不到本地字节（远程外链或未注入 preload）时退回浏览器下载逻辑。
 */
export async function saveImage(
  imageRef: string,
  filename: string,
): Promise<SaveImageResult> {
  const bridge = window.desktop;
  if (!bridge) {
    return saveImageInBrowser(imageRef, filename);
  }

  const bytes = await readLocalBytes(imageRef);
  if (!bytes) {
    return saveImageInBrowser(imageRef, filename);
  }

  const result = await bridge.saveImage(bytes, filename);
  if (result.status === "saved") return "saved";
  if (result.status === "cancelled") return "cancelled";
  throw new Error(result.message || "图片写入失败");
}

/** 只处理 app:// 本地副本，http 外链在渲染层读取容易受 CORS 限制 */
async function readLocalBytes(imageRef: string): Promise<Uint8Array | null> {
  if (!imageRef.startsWith("app://")) return null;
  try {
    const response = await fetch(imageRef);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > 0 ? new Uint8Array(buffer) : null;
  } catch {
    return null;
  }
}
