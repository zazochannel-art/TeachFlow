import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/**
 * Keeps the mobile app in sync with the web app: reloads when the app returns to the
 * foreground and every `intervalMs` while it is open. Screens also reload on focus.
 */
export function useAutoRefresh(reload: () => void, intervalMs = 30000) {
  const ref = useRef(reload);
  useEffect(() => { ref.current = reload; }, [reload]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", s => { if (s === "active") ref.current(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") ref.current(); }, intervalMs);
    return () => { sub.remove(); clearInterval(timer); };
  }, [intervalMs]);
}

/** Reloads data whenever the screen gains focus. */
export function useReloadOnFocus(reload: () => void) {
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
}

/** Current time, refreshed every minute (keeps renders pure). */
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
