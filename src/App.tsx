import { useEffect, useMemo, useState } from "react";

const ZHIPU_IMAGE_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/images/generations";
const ZHIPU_CHAT_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_IMAGE_MODEL = "cogview-3-plus";
const ZHIPU_OPTIMIZE_MODEL = "glm-4-flash";
const HISTORY_STORAGE_KEY = "ai-image-generator-history-v2";

type ImageStyle = "realistic" | "anime";
type ImageSize = "1024x1024" | "768x1344" | "1344x768";

interface HistoryItem {
  id: string;
  prompt: string;
  imageUrl: string;
  createdAt: number;
  size: ImageSize;
  style: ImageStyle;
}

function App() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [style, setStyle] = useState<ImageStyle>("realistic");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const apiKey = import.meta.env.VITE_ZHIPU_API_KEY as string | undefined;

  const selectedItem = useMemo(
    () => history.find((item) => item.id === selectedId) ?? null,
    [history, selectedId],
  );

  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as HistoryItem[];
      if (Array.isArray(parsed)) {
        setHistory(parsed);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setIsDetailOpen(true);
    setError("");
    setStatus("");
  };

  const createNewImage = () => {
    setSelectedId(null);
    setPrompt("");
    setSize("1024x1024");
    setStyle("realistic");
    setIsDetailOpen(true);
    setError("");
    setStatus("填写参数后可生成新图片。");
  };

  const deleteHistory = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setIsDetailOpen(false);
    }
  };

  const loadHistoryToForm = () => {
    if (!selectedItem) return;
    setPrompt(selectedItem.prompt);
    setSize(selectedItem.size);
    setStyle(selectedItem.style);
  };

  const optimizePrompt = async () => {
    if (!apiKey) {
      setError("未配置 VITE_ZHIPU_API_KEY，请先在 .env 中设置。");
      return;
    }
    if (!prompt.trim()) {
      setError("请先输入一个简短描述。");
      return;
    }
    setError("");
    setStatus("正在优化提示词...");
    setIsLoading(true);
    try {
      const response = await fetch(ZHIPU_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ZHIPU_OPTIMIZE_MODEL,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "你是专业提示词优化助手。请把用户简短描述扩展为详细图片生成提示词。必须包含主体、风格、光线、色彩、构图和镜头细节。只输出提示词正文。",
            },
            {
              role: "user",
              content: `请优化此描述：${prompt}`,
            },
          ],
        }),
      });

      const data = await parseApiResponse(response);
      const optimized = data?.choices?.[0]?.message?.content?.trim();
      if (!optimized) {
        throw new Error("优化结果为空");
      }
      setPrompt(optimized);
      setStatus("提示词优化完成。");
    } catch (e) {
      setError(toFriendlyError(e));
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  const generateImage = async () => {
    if (!apiKey) {
      setError("未配置 VITE_ZHIPU_API_KEY，请先在 .env 中设置。");
      return;
    }
    if (!prompt.trim()) {
      setError("请输入提示词后再生成。");
      return;
    }
    setError("");
    setStatus("AI 正在生成图片，请稍候（约 10-30 秒）...");
    setIsLoading(true);

    try {
      const response = await fetch(ZHIPU_IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ZHIPU_IMAGE_MODEL,
          prompt: buildStyledPrompt(prompt, style),
          size,
          style,
        }),
      });
      const data = await parseApiResponse(response);
      const imageUrl = data?.data?.[0]?.url as string | undefined;
      if (!imageUrl) {
        throw new Error("未返回图片地址");
      }
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        prompt: prompt.trim(),
        imageUrl,
        createdAt: Date.now(),
        size,
        style,
      };
      setHistory((prev) => [item, ...prev].slice(0, 30));
      setSelectedId(item.id);
      setStatus("图片生成成功。");
    } catch (e) {
      setError(toFriendlyError(e));
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCurrent = async () => {
    const target = selectedItem?.imageUrl;
    if (!target) return;
    try {
      const response = await fetch(target);
      if (!response.ok) throw new Error("下载失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-image-${formatTimestamp(new Date())}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("图片下载已开始。");
      setError("");
    } catch {
      // 某些跨域图片无法 fetch 为 blob，此时降级为直链下载，避免误报失败。
      const a = document.createElement("a");
      a.href = target;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = `ai-image-${formatTimestamp(new Date())}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("已发起下载请求。若浏览器阻止下载，请允许弹窗后重试。");
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-center text-3xl font-semibold tracking-tight">AI 图片生成器</h1>
      </header>

      <div className="mx-auto mb-8 flex w-full max-w-2xl items-center gap-2 rounded-2xl bg-slate-900 p-2">
        <button
          type="button"
          onClick={createNewImage}
          className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-left text-sm text-slate-400 transition hover:bg-slate-800"
        >
          输入你想生成的图片描述...
        </button>
        <button
          onClick={createNewImage}
          className="rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
        >
          生成
        </button>
      </div>

      <section>
          {history.length === 0 ? (
            <div className="rounded-xl bg-slate-900 py-16 text-center text-slate-400">
              暂无历史图片，点击右上角“新建生成”
            </div>
          ) : (
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-4">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openDetail(item.id)}
                  className="group mb-5 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-slate-900 text-left transition hover:-translate-y-1"
                  type="button"
                >
                  <img
                    src={item.imageUrl}
                    alt="历史图片"
                    className="w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="p-3">
                    <p className="truncate text-xs text-slate-300">{item.prompt}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
      </section>

      {isDetailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setIsDetailOpen(false)}
        >
          <div className="relative w-full max-w-6xl">
            <button
              onClick={() => setIsDetailOpen(false)}
              className="absolute -right-2 -top-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-slate-800 text-slate-200 shadow-lg transition hover:bg-slate-700 hover:text-violet-300"
              aria-label="关闭弹窗"
              type="button"
            >
              <span className="text-lg leading-none">×</span>
            </button>
            <section
              className="grid max-h-[92vh] w-full gap-6 overflow-y-auto rounded-3xl bg-slate-900 p-5 shadow-2xl lg:grid-cols-[360px_1fr]"
              onClick={(event) => event.stopPropagation()}
            >
          <div className="space-y-4 rounded-2xl bg-slate-800/50 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">生成参数详情</h2>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">提示词</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-500"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">尺寸</span>
              <select
                value={size}
                onChange={(event) => setSize(event.target.value as ImageSize)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-500"
              >
                <option value="1024x1024">1024 x 1024</option>
                <option value="768x1344">768 x 1344</option>
                <option value="1344x768">1344 x 768</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">风格</span>
              <select
                value={style}
                onChange={(event) => setStyle(event.target.value as ImageStyle)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-500"
              >
                <option value="realistic">写实风格</option>
                <option value="anime">动漫风格</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={optimizePrompt}
                disabled={isLoading}
                className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
              >
                优化提示词
              </button>
              <button
                onClick={generateImage}
                disabled={isLoading}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
              >
                生成图片
              </button>
              {selectedItem && (
                <button
                  onClick={loadHistoryToForm}
                  className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                >
                  载入该记录参数
                </button>
              )}
            </div>
            {status && <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300">{status}</p>}
            {error && <p className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
          </div>

          <div className="rounded-2xl bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">图片预览</h3>
              <div className="flex gap-2">
                {selectedItem && (
                  <>
                    <button
                      onClick={downloadCurrent}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      下载
                    </button>
                    <button
                      onClick={() => deleteHistory(selectedItem.id)}
                      className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>
            {selectedItem ? (
              <>
                <img
                  src={selectedItem.imageUrl}
                  alt="当前图片"
                  className="max-h-[64vh] w-full rounded-xl border border-slate-700 object-contain bg-slate-950"
                />
                <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-300 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-800 px-3 py-2">
                    <span className="font-medium">尺寸：</span>
                    {selectedItem.size}
                  </div>
                  <div className="rounded-lg bg-slate-800 px-3 py-2">
                    <span className="font-medium">风格：</span>
                    {selectedItem.style}
                  </div>
                  <div className="rounded-lg bg-slate-800 px-3 py-2">
                    <span className="font-medium">时间：</span>
                    {new Date(selectedItem.createdAt).toLocaleString()}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 py-20 text-center text-slate-400">
                当前没有选中历史图片。可先生成新图片。
              </div>
            )}
          </div>
        </section>
        </div>
        </div>
      )}
      </div>
    </div>
  );
}

function buildStyledPrompt(prompt: string, style: ImageStyle): string {
  const styleMap: Record<ImageStyle, string> = {
    realistic: "风格要求：写实，自然光影，细节真实。",
    anime: "风格要求：动漫插画，线条清晰，色彩鲜明。",
  };
  return `${prompt}\n${styleMap[style]}`.trim();
}

async function parseApiResponse(response: Response) {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : {};
  if (!response.ok) {
    const serverMessage = data?.error?.message || data?.message || `请求失败（HTTP ${response.status}）`;
    throw new Error(serverMessage);
  }
  return data;
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function toFriendlyError(error: unknown): string {
  const text = error instanceof Error ? error.message : "发生未知错误";
  if (text.includes("401") || text.includes("invalid")) return "API Key 无效，请检查环境变量配置。";
  if (text.includes("429")) return "请求频率过高，请稍后重试。";
  if (text.includes("fetch")) return "网络异常，请检查连接后重试。";
  return `操作失败：${text}`;
}

export default App;
