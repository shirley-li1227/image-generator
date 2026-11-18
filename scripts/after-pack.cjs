const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * 未配置 Apple Developer 证书时 electron-builder 会完全跳过签名，
 * 而 Electron 自带二进制的 linker-signed 签名与重打包后的 .app 资源不匹配，
 * 下载到其他机器会被判定为「已损坏」。
 * 这里在打包后补一次 ad-hoc 签名（-s -），让 .app 具备完整且自洽的签名。
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
};
