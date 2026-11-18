import { useImageSrc } from "../services/useImageSrc";

interface StoredImageProps {
  imageRef: string;
  alt: string;
  className?: string;
}

/** 渲染历史图片：引用可能是直链，也可能是 IndexedDB / 本地文件，统一在这里解析。 */
export function StoredImage({
  imageRef,
  alt,
  className = "",
}: StoredImageProps) {
  const src = useImageSrc(imageRef);

  if (!src) {
    return <div className={`${className} bg-slate-800`} aria-label={alt} />;
  }

  return <img src={src} alt={alt} className={className} />;
}
