import type { SaveImageResult } from "../../services/platform";
import { historyStore } from "./historyStore";
import { isDirectImageSrc } from "./imageSrc";

export async function saveImage(
  imageRef: string,
  filename: string,
): Promise<SaveImageResult> {
  const blob = await readImageBlob(imageRef);
  if (!blob) {
    // 跨域外链无法读取为 blob，降级为直链下载
    triggerAnchor(imageRef, filename, true);
    return "fallback";
  }

  const url = URL.createObjectURL(blob);
  triggerAnchor(url, filename, false);
  // 部分浏览器在 click 之后才真正读取 blob，延迟回收避免下载中断
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

async function readImageBlob(imageRef: string): Promise<Blob | null> {
  if (!isDirectImageSrc(imageRef)) {
    return historyStore.getImage(imageRef).catch(() => null);
  }
  try {
    const response = await fetch(imageRef);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

function triggerAnchor(
  href: string,
  filename: string,
  openInNewTab: boolean,
): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  if (openInNewTab) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
