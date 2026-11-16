"use client";

import { useEffect } from "react";

/** Sends one browser error report to /api/client-error (fire and forget). */
export function sendClientError(e: { message: string; stack?: string; digest?: string }) {
  try {
    const body = JSON.stringify({ ...e, message: e.message.slice(0, 500), stack: e.stack?.slice(0, 2000), path: location.pathname });
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-error", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    // Never let reporting throw.
  }
}

/** Reports uncaught errors and rejected promises in the browser, at most 5 per page load. */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const send = (message: string, stack?: string) => {
      // Browser extensions and cross-origin scripts only say "Script error."
      if (sent >= 5 || !message || message === "Script error.") return;
      sent++;
      sendClientError({ message, stack });
    };
    const onError = (ev: ErrorEvent) => send(ev.message, ev.error instanceof Error ? ev.error.stack : undefined);
    const onRejection = (ev: PromiseRejectionEvent) => send(ev.reason instanceof Error ? ev.reason.message : String(ev.reason), ev.reason instanceof Error ? ev.reason.stack : undefined);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
