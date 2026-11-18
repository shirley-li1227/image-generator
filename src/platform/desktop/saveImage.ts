import type { SaveImageResult } from "../../services/platform";
import { readImageBlob, saveImage as saveImageInBrowser } from "../web/downloadImage";

/**
 * 桌面端保存：优先走 preload 暴露的原生保存对话框，并直接写盘。
 * 用 desktop 构建在普通浏览器里调试时没有 bridge，自动退回浏览器下载逻辑。
 */
export async function saveImage(
  imageRef: string,
  filename: string,
): Promise<SaveImageResult> {
  const bridge = window.desktop;
  if (!bridge) {
    return saveImageInBrowser(imageRef, filename);
  }

  const blob = await readImageBlob(imageRef);
  if (!blob) {
    // 跨域外链读不出内容时，交给浏览器端降级逻辑处理
    return saveImageInBrowser(imageRef, filename);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = await bridge.saveImage(bytes, filename);
  if (result.status === "saved") return "saved";
  if (result.status === "cancelled") return "cancelled";
  throw new Error(result.message || "图片写入失败");
}
