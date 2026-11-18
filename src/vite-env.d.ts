/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 桌面端（--mode desktop）指向已部署的 Pages Functions 地址；web 留空走相对路径 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
