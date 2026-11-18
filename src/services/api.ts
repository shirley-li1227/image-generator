import type { ImageSize, ImageStyle } from "./types";

/**
 * web 端留空，走相对路径（开发期由 Vite 代理到 wrangler，线上由 Pages Functions 处理）；
 * 桌面端通过 VITE_API_BASE 指向已部署的 Functions 地址。
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export interface GenerateImageInput {
  prompt: string;
  size: ImageSize;
  style: ImageStyle;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseApiResponse(response);
  return data as T;
}

async function parseApiResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const data = isJson
    ? ((await response.json()) as Record<string, unknown>)
    : {};
  if (!response.ok) {
    const serverMessage =
      (data.error as { message?: string } | undefined)?.message ||
      (data.message as string | undefined) ||
      `请求失败（HTTP ${response.status}）`;
    throw new Error(serverMessage);
  }
  return data;
}

export async function optimizePrompt(prompt: string): Promise<string> {
  const data = await postJson<{ optimized?: string }>("/api/optimize", {
    prompt,
  });
  const optimized =
    typeof data.optimized === "string" ? data.optimized.trim() : "";
  if (!optimized) {
    throw new Error("优化结果为空");
  }
  return optimized;
}

export async function generateImage(
  input: GenerateImageInput,
): Promise<string> {
  const data = await postJson<{ imageUrl?: string }>("/api/image", input);
  if (!data.imageUrl) {
    throw new Error("未返回图片地址");
  }
  return data.imageUrl;
}

export function toFriendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : "发生未知错误";
  if (text.includes("401") || text.includes("invalid"))
    return "API Key 无效，请检查服务端 Secret 配置。";
  if (text.includes("429")) return "请求频率过高，请稍后重试。";
  if (text.includes("fetch")) return "网络异常，请检查连接后重试。";
  return `操作失败：${text}`;
}
