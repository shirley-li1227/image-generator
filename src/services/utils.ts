/** 生成记录 id；部分 WebView 无 crypto.randomUUID，降级到 getRandomValues。 */
export function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const random =
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")
      : Math.random().toString(16).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

export function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}
