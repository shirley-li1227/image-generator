import { useEffect, useMemo, useState } from "react";
import { platform } from "@platform";
import { StoredImage } from "./components/StoredImage";
import {
  generateImage as requestImage,
  optimizePrompt as requestOptimizePrompt,
  toFriendlyError,
} from "./services/api";
import type { HistoryItem, ImageSize, ImageStyle } from "./services/types";
import { createId, formatTimestamp } from "./services/utils";

const HISTORY_LIMIT = 30;

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
  const [isHydrated, setIsHydrated] = useState(false);

  const selectedItem = useMemo(
    () => history.find((item) => item.id === selectedId) ?? null,
    [history, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    platform.historyStore
      .load()
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 必须等首次读取完成再写回，否则会用空数组覆盖已存的历史
    if (!isHydrated) return;
    void platform.historyStore.save(history);
  }, [history, isHydrated]);

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
    const target = history.find((item) => item.id === id);
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (target) void platform.historyStore.deleteImage(target.imageRef);
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
    if (!prompt.trim()) {
      setError("请先输入一个简短描述。");
      return;
    }
    setError("");
    setStatus("正在优化提示词...");
    setIsLoading(true);
    try {
      const optimized = await requestOptimizePrompt(prompt);
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
    if (!prompt.trim()) {
      setError("请输入提示词后再生成。");
      return;
    }
    setError("");
    setStatus("AI 正在生成图片，请稍候（约 10-30 秒）...");
    setIsLoading(true);

    try {
      const imageUrl = await requestImage({ prompt, size, style });
      const id = createId();
      const item: HistoryItem = {
        id,
        prompt: prompt.trim(),
        imageRef: imageUrl,
        createdAt: Date.now(),
        size,
        style,
      };
      setHistory((prev) => [item, ...prev].slice(0, HISTORY_LIMIT));
      setSelectedId(id);
      setStatus("图片生成成功。");
      // 智谱返回的是临时链接，尽快转存为本地副本，避免过期后历史记录裂图
      void platform.historyStore
        .captureRemote(imageUrl, id)
        .then((localRef) => {
          if (!localRef) return;
          setHistory((prev) =>
            prev.map((entry) =>
              entry.id === id ? { ...entry, imageRef: localRef } : entry,
            ),
          );
        });
    } catch (e) {
      setError(toFriendlyError(e));
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCurrent = async () => {
    const target = selectedItem?.imageRef;
    if (!target) return;
    try {
      const result = await platform.saveImage(
        target,
        `ai-image-${formatTimestamp(new Date())}.png`,
      );
      setStatus(
        result === "saved"
          ? "图片下载已开始。"
          : "已发起下载请求。若浏览器阻止下载，请允许弹窗后重试。",
      );
      setError("");
    } catch {
      setError("下载失败，请重试。");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-center text-3xl font-semibold tracking-tight">
            AI 图片生成器
          </h1>
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
                  <StoredImage
                    imageRef={item.imageRef}
                    alt="历史图片"
                    className="h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="p-3">
                    <p className="truncate text-xs text-slate-300">
                      {item.prompt}
                    </p>
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
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      提示词
                    </span>
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      尺寸
                    </span>
                    <select
                      value={size}
                      onChange={(event) =>
                        setSize(event.target.value as ImageSize)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-500"
                    >
                      <option value="1024x1024">1024 x 1024</option>
                      <option value="768x1344">768 x 1344</option>
                      <option value="1344x768">1344 x 768</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-200">
                      风格
                    </span>
                    <select
                      value={style}
                      onChange={(event) =>
                        setStyle(event.target.value as ImageStyle)
                      }
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
                  {status && (
                    <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300">
                      {status}
                    </p>
                  )}
                  {error && (
                    <p className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
                      {error}
                    </p>
                  )}
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
                      <StoredImage
                        imageRef={selectedItem.imageRef}
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

export default App;
