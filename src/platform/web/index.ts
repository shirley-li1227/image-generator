import type { PlatformApi } from "../../services/platform";
import { saveImage } from "./downloadImage";
import { historyStore } from "./historyStore";
import { directImageSrc, resolveImageSrc } from "./imageSrc";

export const platform: PlatformApi = {
  target: "web",
  historyStore,
  directImageSrc,
  resolveImageSrc,
  saveImage,
};
