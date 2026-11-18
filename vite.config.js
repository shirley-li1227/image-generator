import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// `--mode desktop` 时把 @platform 指向桌面端实现，web 构建保持 src/platform/web。
export default defineConfig(({ mode }) => {
    const isDesktop = mode === "desktop";
    return {
        // 桌面端由自定义 app:// 协议加载产物，使用相对路径；web 保持根路径部署
        base: isDesktop ? "./" : "/",
        plugins: [react()],
        resolve: {
            alias: {
                "@platform": fileURLToPath(new URL(`./src/platform/${isDesktop ? "desktop" : "web"}`, import.meta.url)),
            },
        },
        server: {
            // 桌面壳（Tauri / Electron）需要固定端口，web 保持自动递增
            port: isDesktop ? 1420 : 5173,
            strictPort: isDesktop,
            // 本地开发时把 /api 转发到 wrangler pages dev（默认 8788），生产环境由 Pages Functions 直接处理。
            proxy: {
                "/api": "http://127.0.0.1:8788",
            },
        },
    };
});
