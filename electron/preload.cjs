const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  /**
   * 由主进程弹出原生保存对话框并写盘。
   * @param {Uint8Array} bytes 图片二进制内容
   * @param {string} filename 默认文件名
   * @returns {Promise<{ status: "saved" | "cancelled" | "failed", filePath?: string }>}
   */
  saveImage: (bytes, filename) =>
    ipcRenderer.invoke("image:save", { data: bytes, filename }),

  /** 历史记录与本地图片副本，落 userData 目录 */
  history: {
    /** null 表示本地还没有历史文件 */
    load: () => ipcRenderer.invoke("history:load"),
    save: (items) => ipcRenderer.invoke("history:save", items),
    putImage: (key, bytes) =>
      ipcRenderer.invoke("image:write", { key, data: bytes }),
    deleteImage: (key) => ipcRenderer.invoke("image:delete", key),
    captureRemote: (url, key) =>
      ipcRenderer.invoke("image:captureRemote", { url, key }),
  },
});
