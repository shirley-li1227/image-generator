const apiUrl = "https://open.bigmodel.cn/api/paas/v4/images/generations";

const ALLOWED_SIZES = ["1024x1024", "768x1344", "1344x768"];

interface Env {
  ZHIPU_API_KEY?: string;
  ZHIPU_IMAGE_MODEL?: string;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

function buildStyledPrompt(prompt: string, style: string): string {
  const styleMap: Record<string, string> = {
    realistic: "风格要求：写实，自然光影，细节真实。",
    anime: "风格要求：动漫插画，线条清晰，色彩鲜明。",
  };
  return `${prompt}\n${styleMap[style] ?? styleMap.realistic}`.trim();
}

export function onRequestOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;

  try {
    const apiKey = env.ZHIPU_API_KEY;
    if (!apiKey) {
      return json({ error: { message: "服务端未配置 ZHIPU_API_KEY。" } }, 500);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: { message: "请求体不是有效的 JSON。" } }, 400);
    }

    const prompt = body.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return json({ error: { message: "请求缺少 prompt 字段。" } }, 400);
    }

    const size =
      typeof body.size === "string" && ALLOWED_SIZES.includes(body.size)
        ? body.size
        : "1024x1024";
    const style = typeof body.style === "string" ? body.style : "realistic";

    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.ZHIPU_IMAGE_MODEL || "cogview-3-plus",
        prompt: buildStyledPrompt(prompt.trim(), style),
        size,
      }),
    });

    const data = (await upstream.json().catch(() => null)) as {
      data?: Array<{ url?: string }>;
      error?: { message?: string };
    } | null;

    if (!upstream.ok) {
      return json(
        {
          error: {
            message:
              data?.error?.message ||
              `智谱接口请求失败（HTTP ${upstream.status}）。`,
          },
        },
        upstream.status,
      );
    }

    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) {
      return json({ error: { message: "未返回图片地址。" } }, 502);
    }

    return json({ imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务异常";
    return json({ error: { message } }, 500);
  }
}
