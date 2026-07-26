// Lightweight platform detection for UI hints. We avoid tauri-plugin-os here
// because render code needs a synchronous answer for a single key label.
export type Platform = "mac" | "windows" | "linux" | "other";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";

  const userAgent = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform ?? "").toLowerCase();

  if (platform.includes("mac") || userAgent.includes("mac os")) return "mac";
  if (platform.includes("win") || userAgent.includes("windows")) return "windows";
  if (platform.includes("linux") || userAgent.includes("linux")) return "linux";
  return "other";
}

export function isMac(): boolean {
  return detectPlatform() === "mac";
}
