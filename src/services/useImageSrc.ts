import { useEffect, useState } from "react";
import { platform } from "@platform";

interface ResolvedState {
  imageRef: string;
  src: string;
}

/**
 * 把 HistoryItem.imageRef 解析为可直接渲染的地址。
 * 直链同步返回避免闪烁，IndexedDB / 本地文件引用异步解析，卸载时自动回收 objectURL。
 */
export function useImageSrc(imageRef: string): string | null {
  const [state, setState] = useState<ResolvedState | null>(() => {
    const direct = platform.directImageSrc(imageRef);
    return direct ? { imageRef, src: direct } : null;
  });

  useEffect(() => {
    let disposed = false;
    let revoke: (() => void) | undefined;

    const direct = platform.directImageSrc(imageRef);
    if (direct) {
      setState({ imageRef, src: direct });
      return () => undefined;
    }

    setState(null);
    platform
      .resolveImageSrc(imageRef)
      .then((resolved) => {
        if (!resolved) return;
        if (disposed) {
          resolved.revoke?.();
          return;
        }
        revoke = resolved.revoke;
        setState({ imageRef, src: resolved.src });
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      revoke?.();
    };
  }, [imageRef]);

  return state && state.imageRef === imageRef ? state.src : null;
}
