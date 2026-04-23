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
- 智谱 AI API（`chat/completions` + `images/generations`）

## 项目结构

```txt
image-generator/
├─ src/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ index.css
│  └─ vite-env.d.ts
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

在项目根目录创建 `.env`：

```bash
VITE_ZHIPU_API_KEY=your_zhipu_api_key
```

## 本地运行

```bash
npm install
npm run dev
```

默认会启动 Vite 开发服务器（如 `http://localhost:5173`，若端口占用会自动递增）。

## 构建与预览

```bash
npm run build
npm run preview
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

- 未配置 `VITE_ZHIPU_API_KEY` 时，生成和优化会提示配置错误
- 文生图通常需要 10-30 秒，请耐心等待
- 某些图片源可能受跨域限制，下载会自动走降级策略以尽量保证成功
