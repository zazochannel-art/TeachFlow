import type { PushState } from "./push";
import { APP_VERSION } from "./config";

/** Cookie the web server reads on sign-out to forget this phone's push token (web: src/lib/push/native.ts). */
export const PUSH_COOKIE = "tf-native-push";

/** Messages the web page sends with window.ReactNativeWebView.postMessage(JSON.stringify(msg)). */
export type WebMessage =
  | { type: "ready" }
  | { type: "push:enable" }
  | { type: "theme"; dark: boolean }
  | { type: "file:save"; name: string; mime: string; base64: string }
  | { type: "open"; url: string }
  | { type: "keep-awake"; on: boolean };

export function parseMessage(raw: string): WebMessage | null {
  try {
    const m = JSON.parse(raw) as WebMessage;
    return m && typeof m === "object" && typeof m.type === "string" ? m : null;
  } catch {
    return null;
  }
}

/**
 * JavaScript that publishes the app's state to the page as window.TeachFlowNative and fires a
 * "teachflow-native" event, so the web app can save the push token and switch its notification
 * settings to the native ones. Runs before the page loads and again whenever the state changes.
 */
export function stateScript(push: PushState) {
  const state = JSON.stringify({ platform: "android", version: APP_VERSION, push });
  const cookie = push.token
    ? `${PUSH_COOKIE}=${encodeURIComponent(push.token)}; path=/; max-age=31536000; samesite=lax; secure`
    : `${PUSH_COOKIE}=; path=/; max-age=0; samesite=lax; secure`;
  return `(function(){try{
window.TeachFlowNative=${state};
document.cookie=${JSON.stringify(cookie)};
window.dispatchEvent(new Event("teachflow-native"));
}catch(e){}})();true;`;
}
