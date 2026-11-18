import type { ResolvedImage } from "../../services/platform";
import { imageRefForKey } from "./imageRefs";

const DIRECT_SRC_PATTERN = /^(app:\/\/|https?:|data:|blob:)/i;

/** app:// 本地副本与直链都能直接渲染，无需异步解析 */
export function directImageSrc(imageRef: string): string | null {
  return DIRECT_SRC_PATTERN.test(imageRef) ? imageRef : null;
}

export async function resolveImageSrc(
  imageRef: string,
): Promise<ResolvedImage | null> {
  if (DIRECT_SRC_PATTERN.test(imageRef)) {
    return { src: imageRef };
  }
  // 兜底：把裸 key 当成图片副本 id
  return { src: imageRefForKey(imageRef) };
}
