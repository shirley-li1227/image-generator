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
});
