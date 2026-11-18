# AI 图片生成器

基于 React + TypeScript + Vite + Tailwind CSS 的 AI 图片生成应用，支持智谱 AI 文生图、提示词优化、历史记录管理与图片下载。

## 功能概览

- 智谱 AI 文生图：输入提示词并选择尺寸、风格后生成图片
- 提示词优化：将简短描述扩展为包含主体、风格、光线、色彩、构图等细节的提示词
- 历史记录：生成成功后自动写入 IndexedDB（含本地图片副本），首页以瀑布流展示
- 详情弹窗：点击历史图片查看参数详情，并可继续优化/生成
- 图片下载：支持时间戳命名下载，跨域场景自动降级直链下载
- 深色主题：简洁暗色 UI，首页一键进入生成弹窗

## 技术栈

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- IndexedDB（保存历史记录与图片副本，兼容旧版 LocalStorage 数据）
- Cloudflare Pages Functions（服务端代理，隔离密钥）
- 智谱 AI API（`chat/completions` + `images/generations`）
- Electron（桌面端外壳，与 web 共用同一份渲染层）

## 项目结构

```txt
image-generator/
├─ electron/
│  ├─ main.cjs                # 主进程：app:// 协议、窗口、原生保存
│  └─ preload.cjs             # 暴露 window.desktop.saveImage
├─ scripts/
│  └─ electron-dev.mjs        # 同时启动 Vite 与 Electron
├─ functions/
│  └─ api/
│     ├─ optimize.ts          # 提示词优化代理
│     └─ image.ts             # 文生图代理
├─ src/
│  ├─ components/
│  │  └─ StoredImage.tsx      # 统一解析 imageRef 的图片组件
│  ├─ platform/
│  │  ├─ web/                 # IndexedDB + blob 下载实现
│  │  └─ desktop/             # 桌面端接入点（当前复用 web 实现）
│  ├─ services/
│  │  ├─ api.ts               # 接口调用与错误文案
│  │  ├─ types.ts             # 领域类型
│  │  ├─ platform.ts          # HistoryStore / PlatformApi 契约
│  │  ├─ useImageSrc.ts       # imageRef -> 可渲染地址
│  │  └─ utils.ts             # id 生成、时间戳格式化
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
├─ docs/
│  └─ 项目简介.md          # 简历 / 作品集版项目介绍
├─ PRD.md
└─ TECH_DESIGN.md
```

平台差异集中在 `src/platform/`，由 `@platform` 别名在构建时决定具体实现：web 构建指向 `src/platform/web`，`--mode desktop` 指向 `src/platform/desktop`。业务代码只依赖 `src/services/platform.ts` 中的契约。

## 环境变量

API Key 只存在于服务端，不会进入浏览器产物：

- 线上：在 Cloudflare Pages 项目的 `Settings → Variables and Secrets` 中配置 Secret 类型变量 `ZHIPU_API_KEY`
- 可选变量：`ZHIPU_CHAT_MODEL`（默认 `glm-4-flash`）、`ZHIPU_IMAGE_MODEL`（默认 `cogview-3-plus`）
- 本地：复制 `.dev.vars.example` 为 `.dev.vars` 并填入 Key
- 桌面端构建：用 `VITE_API_BASE` 指定已部署的 Functions 地址（web 端留空走相对路径），参考 `.env.desktop.example`

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

## 双端构建

同一份 `src/` 同时支持 web 与 Electron 桌面端：

```bash
npm run dev            # web 开发，端口 5173
npm run build          # web 产物（部署到 Cloudflare Pages）
npm run dev:desktop    # 仅桌面端渲染层，端口固定 1420
npm run build:desktop  # 桌面端产物（@platform -> src/platform/desktop，资源用相对路径）
npm run electron:dev   # 一键启动 Vite + Electron（推荐）
npm run electron:start # 构建后以生产模式启动 Electron
```

## Electron 桌面端

- 主进程 `electron/main.cjs` 用自定义协议 `app://` 加载 `dist/`，而不是 `file://`——Chromium 在 `file://` 下不提供 IndexedDB，历史记录会失效
- 历史记录存 `userData/history.json`，图片副本存 `userData/images/<id>.png`，渲染层通过 preload IPC 读写；图片引用为 `app://images/<id>.png`，由主进程协议处理器提供
- 转存外链图片走主进程 `net.fetch`，不受浏览器 CORS 限制；写入采用临时文件 + rename，避免半写文件
- 渲染层通过 preload 暴露的 `window.desktop.saveImage` 调用原生保存对话框并直接写盘；没有该 bridge 时自动回退浏览器下载
- 桌面端请求的后端地址由 `VITE_API_BASE` 指定（复制 `.env.desktop.example` 为 `.env.desktop`），仍复用同一套 Pages Functions，密钥不入客户端
- `electron:dev` 下 `/api` 走 Vite 代理，需本机同时运行 `npx wrangler pages dev dist`
- 打包与分发见下方「打包分发」一节；未配置代码签名与公证，首次打开需手动放行

## 打包分发

```bash
npm run pack      # 只产出未压缩的 .app（release/mac-arm64）
npm run dist:mac  # macOS：dmg + zip（arm64）
npm run dist:win  # Windows：nsis 安装包（需在 Windows 下执行，macOS 需额外装 wine）
```

产物在 `release/`：`AI 图片生成器-1.0.0-arm64.dmg`（约 99 MB）、`AI 图片生成器-1.0.0-arm64-mac.zip`、`latest-mac.yml`（自动更新元数据）。

- 配置集中在 `electron-builder.yml`：`appId`、`productName`（窗口/应用名）、图标 `assets/icon.png`、asar、打包文件白名单
- 未配置 Apple Developer 证书时 `mac.identity: null` 会跳过签名，随后由 `scripts/after-pack.cjs` 补一次 **ad-hoc 签名**；否则 Electron 原始签名与重打包后的资源不匹配，别人下载会提示「已损坏」
- ad-hoc 签名未经公证，拷贝到其他机器首次打开仍需右键 →「打开」，或执行 `xattr -dr com.apple.quarantine /Applications/AI\ 图片生成器.app`
- 需要正式分发时：申请 Apple Developer（$99/年，个人账号即可）→ 导入 `Developer ID Application` 证书（`CSC_LINK` / `CSC_KEY_PASSWORD`）→ 设置 `identity` 并开启公证（`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`）
- 自动更新（`electron-updater`）要求签名包，当前只生成 `latest-mac.yml`，尚未接入
- 打包产物的 `userData` 与开发模式一致（均为 `image-generator`），已存的历史记录不会因为换成分发包而丢失

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

web 端：

- 存储位置：浏览器 IndexedDB（数据库 `image-generator`，`meta` 存元数据、`images` 存图片 Blob）
- 记录内容：
  - `id`
  - `prompt`
  - `imageRef`（IndexedDB 图片 key，兼容旧版外链）
  - `createdAt`
  - `size`
  - `style`
- 旧版本存放在 LocalStorage（key `ai-image-generator-history-v2`）的记录会在首次启动时自动迁移，并尽力把外链图片转存为本地副本
- 生成成功后会把智谱返回的临时链接抓成本地 Blob，避免链接过期导致历史记录裂图

桌面端（Electron）：

- 存储位置：`app.getPath("userData")`，macOS 为 `~/Library/Application Support/image-generator/`
- 元数据：`history.json`（写入时先写 `.tmp` 再 rename）
- 图片副本：`images/<id>.png`，通过 `app://images/<id>.png` 渲染；仅当本地没有副本时才沿用外链
- 旧版桌面壳的 IndexedDB 记录会在首次升级时自动迁移到文件存储
- `history:save` 会清理超过 10 分钟的孤儿图片文件，避免删除记录后图片残留

## 注意事项

- 服务端未配置 `ZHIPU_API_KEY` 时，接口返回“服务端未配置 ZHIPU_API_KEY”
- 智谱返回 401 表示 Key 失效；返回 429 通常是余额不足或未购买对应模型（如 `cogview-3-plus`）的资源包
- 文生图通常需要 10-30 秒，请耐心等待
- 某些图片源可能受跨域限制，下载会自动走降级策略以尽量保证成功
