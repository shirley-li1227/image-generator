const apiUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

const SYSTEM_PROMPT =
  "你是专业提示词优化助手。请把用户简短描述扩展为详细图片生成提示词。必须包含主体、风格、光线、色彩、构图和镜头细节。只输出提示词正文。";

interface Env {
  ZHIPU_API_KEY?: string;
  ZHIPU_CHAT_MODEL?: string;
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

    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.ZHIPU_CHAT_MODEL || "glm-4-flash",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `请优化此描述：${prompt}` },
        ],
      }),
    });

    const data = (await upstream.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
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

    const optimized = data?.choices?.[0]?.message?.content?.trim();
    if (!optimized) {
      return json({ error: { message: "优化结果为空。" } }, 502);
    }

    return json({ optimized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务异常";
    return json({ error: { message } }, 500);
  }
}
