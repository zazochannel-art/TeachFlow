/**
 * The Android app (mobile/) shows this site in a WebView and publishes its state as
 * window.TeachFlowNative (mobile/src/lib/bridge.ts). These helpers are for client components only.
 */
export interface NativeState {
  platform: "android" | "ios";
  version: string;
  push: { status: "granted" | "denied" | "undetermined" | "unavailable"; token: string | null };
}

export type NativeMessage =
  | { type: "ready" }
  | { type: "push:enable" }
  | { type: "theme"; dark: boolean }
  | { type: "file:save"; name: string; mime: string; base64: string }
  | { type: "open"; url: string };

declare global {
  interface Window {
    TeachFlowNative?: NativeState;
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

/** Fired on window whenever the app updates window.TeachFlowNative. */
export const NATIVE_EVENT = "teachflow-native";

export const nativeState = (): NativeState | null =>
  typeof window !== "undefined" && window.TeachFlowNative && window.ReactNativeWebView ? window.TeachFlowNative : null;

export const inNativeApp = () => nativeState() !== null;

export function postNative(msg: NativeMessage) {
  try { window.ReactNativeWebView?.postMessage(JSON.stringify(msg)); } catch { /* not in the app */ }
}

/**
 * Saves a file made in the page (e.g. the whiteboard as PNG). A WebView cannot download blob: links,
 * so inside the app the file goes to Android's share sheet; in a browser it downloads as usual.
 */
export async function saveBlob(blob: Blob, name: string) {
  if (inNativeApp()) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    postNative({ type: "file:save", name, mime: blob.type || "application/octet-stream", base64 });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
