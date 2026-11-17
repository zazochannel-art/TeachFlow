"use client";

import { useEffect } from "react";
import { inNativeApp, postNative } from "@/lib/native";

interface WakeLockHandle { release: () => Promise<void>; released?: boolean }
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> } };

/**
 * Keeps the screen on while `active` (during a call), so a phone does not go dark and stop the
 * camera while the student only watches and listens. Inside the Android app the app does it
 * (expo-keep-awake, message "keep-awake"); in a browser the Screen Wake Lock API, taken again
 * when the tab comes back (the browser drops the lock when the tab is hidden).
 */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (inNativeApp()) {
      postNative({ type: "keep-awake", on: true });
      return () => postNative({ type: "keep-awake", on: false });
    }
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let lock: WakeLockHandle | null = null;
    let stopped = false;
    const take = async () => {
      if (stopped || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const next = await nav.wakeLock!.request("screen");
        if (stopped) void next.release().catch(() => {});
        else lock = next;
      } catch {
        // Refused (battery saver, not allowed): the call still works, the screen may just dim.
      }
    };
    void take();
    const onVisible = () => { void take(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
