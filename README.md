# AI 图片生成器

基于 React + TypeScript + Vite + Tailwind CSS 的 AI 图片生成应用，支持智谱 AI 文生图、提示词优化、历史记录管理与图片下载。

## 功能概览

- 智谱 AI 文生图：输入提示词并选择尺寸、风格后生成图片
- 提示词优化：将简短描述扩展为包含主体、风格、光线、色彩、构图等细节的提示词
- 历史记录：生成成功后自动写入 LocalStorage，首页以瀑布流展示
- 详情弹窗：点击历史图片查看参数详情，并可继续优化/生成
- 图片下载：支持时间戳命名下载，跨域场景自动降级直链下载
- 深色主题：简洁暗色 UI，首页一键进入生成弹窗

## 技术栈

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- LocalStorage（保存历史记录）
- Cloudflare Pages Functions（服务端代理，隔离密钥）
- 智谱 AI API（`chat/completions` + `images/generations`）

## 项目结构

```txt
image-generator/
├─ functions/
│  └─ api/
│     ├─ optimize.ts   # 提示词优化代理
│     └─ image.ts      # 文生图代理
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ index.css
│  └─ vite-env.d.ts
├─ .dev.vars.example
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js
├─ postcss.config.js
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ PRD.md
└─ TECH_DESIGN.md
```

## 环境变量

API Key 只存在于服务端，不会进入浏览器产物：

- 线上：在 Cloudflare Pages 项目的 `Settings → Variables and Secrets` 中配置 Secret 类型变量 `ZHIPU_API_KEY`
- 可选变量：`ZHIPU_CHAT_MODEL`（默认 `glm-4-flash`）、`ZHIPU_IMAGE_MODEL`（默认 `cogview-3-plus`）
- 本地：复制 `.dev.vars.example` 为 `.dev.vars` 并填入 Key

```bash
cp .dev.vars.example .dev.vars
```

切勿使用 `VITE_` 前缀存放密钥，这类变量会被 Vite 打包进前端 JS，任何访问者都能提取。

## 本地运行

`/api/*` 由 Pages Functions 提供，需要同时启动 Vite 与 wrangler：

```bash
npm install
npm run build

# 终端 1：启动 Pages Functions（默认 8788，读取 .dev.vars）
npx wrangler pages dev dist

# 终端 2：启动前端（vite 已配置 /api 代理到 8788）
npm run dev
```

Vite 默认地址为 `http://localhost:5173`，若端口占用会自动递增。

## 构建与预览

```bash
npm run build
npm run preview   # 仅预览静态资源，/api 接口不可用
```

## 部署

项目部署在 Cloudflare Pages，Git 推送后自动构建（构建命令 `npm run build`，输出目录 `dist`），`functions/` 目录会被 Pages 自动识别为 Functions。

手动部署：

```bash
npm run build
npx wrangler pages deploy dist --project-name image-generator
```

## 使用说明

1. 打开首页，点击顶部输入区域或 `生成` 按钮进入弹窗
2. 在弹窗中填写/编辑提示词，选择尺寸和风格
3. 可先点 `优化提示词`，再点 `生成图片`
4. 生成成功后：
   - 图片会显示在弹窗预览区
   - 历史记录会自动保存到 LocalStorage
5. 回到首页可在瀑布流中查看历史图片，点击任意图片可再次进入详情
6. 点击 `下载` 可保存图片，文件名格式为 `ai-image-YYYYMMDD-HHMMSS.png`

## 历史记录存储说明

- 存储位置：浏览器 LocalStorage
- Key：`ai-image-generator-history-v2`
- 记录内容：
  - `id`
  - `prompt`
  - `imageUrl`
  - `createdAt`
  - `size`
  - `style`

## 注意事项

- 服务端未配置 `ZHIPU_API_KEY` 时，接口返回“服务端未配置 ZHIPU_API_KEY”
- 智谱返回 401 表示 Key 失效；返回 429 通常是余额不足或未购买对应模型（如 `cogview-3-plus`）的资源包
- 文生图通常需要 10-30 秒，请耐心等待
- 某些图片源可能受跨域限制，下载会自动走降级策略以尽量保证成功
