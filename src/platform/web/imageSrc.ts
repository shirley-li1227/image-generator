import type { ResolvedImage } from "../../services/platform";
import { historyStore } from "./historyStore";

const DIRECT_SRC_PATTERN = /^(https?:|data:|blob:)/i;

/** 外链、data URI、objectURL 无需再走存储层 */
export function isDirectImageSrc(imageRef: string): boolean {
  return DIRECT_SRC_PATTERN.test(imageRef);
}

export function directImageSrc(imageRef: string): string | null {
  return isDirectImageSrc(imageRef) ? imageRef : null;
}

export async function resolveImageSrc(
  imageRef: string,
): Promise<ResolvedImage | null> {
  if (isDirectImageSrc(imageRef)) {
    return { src: imageRef };
  }
  const blob = await historyStore.getImage(imageRef);
  if (!blob) return null;
  const src = URL.createObjectURL(blob);
  return { src, revoke: () => URL.revokeObjectURL(src) };
}
