/** 桌面端本地图片副本的引用格式：app://images/<id>.png，由主进程协议处理器提供 */
export const IMAGE_REF_PREFIX = "app://images/";

export function imageRefForKey(key: string): string {
  return `${IMAGE_REF_PREFIX}${key}.png`;
}

export function keyFromImageRef(imageRef: string): string | null {
  if (!imageRef.startsWith(IMAGE_REF_PREFIX)) return null;
  const key = imageRef.slice(IMAGE_REF_PREFIX.length).replace(/\.png$/i, "");
  return key || null;
}
