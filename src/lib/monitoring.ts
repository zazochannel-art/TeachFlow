/**
 * Error reporting without a third-party SDK: every error goes to the server log as one JSON line
 * (Vercel → Logs, filter "tf-error"), and, when ERROR_WEBHOOK_URL is set, to a Slack/Discord-style
 * webhook so someone is told right away. No request headers, cookies or query strings are sent.
 */
export interface ErrorReport { source: "server" | "browser"; message: string; path?: string; digest?: string; stack?: string; kind?: string }

const recent = new Map<string, number>();
const QUIET_MS = 10 * 60 * 1000;
/** At most this many webhook messages per instance per QUIET_MS, whatever the messages say. */
export const WEBHOOK_BUDGET = 30;
let budget = { start: 0, sent: 0 };

/** True while this instance may still post to the webhook in the current window (counts the post). */
export function takeWebhookBudget(now = Date.now()) {
  if (now - budget.start >= QUIET_MS) budget = { start: now, sent: 0 };
  if (budget.sent >= WEBHOOK_BUDGET) return false;
  budget.sent++;
  return true;
}

/** Next.js control-flow "errors" (redirect, notFound) are not failures. */
export function isControlFlow(err: unknown) {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND" || digest === "DYNAMIC_SERVER_USAGE";
}

export function cleanPath(path: string | undefined) {
  return (path ?? "").split("?")[0].slice(0, 200);
}

export async function reportError(r: ErrorReport) {
  const report = { ...r, message: r.message.slice(0, 500), path: cleanPath(r.path), stack: r.stack?.slice(0, 2000) };
  console.error("tf-error", JSON.stringify(report));

  const hook = process.env.ERROR_WEBHOOK_URL;
  if (!hook) return;
  // The same error from the same place is sent once per 10 minutes per server instance.
  const key = `${report.source}|${report.path}|${report.message}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - QUIET_MS) return;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  // Many different messages (an outage, or someone flooding /api/client-error) must not flood the chat.
  if (!takeWebhookBudget(now)) return;

  const text = `TeachFlow ${report.source} error${report.path ? ` on ${report.path}` : ""}: ${report.message}${report.digest ? ` (digest ${report.digest})` : ""}`;
  try {
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(3000) });
  } catch {
    // Reporting must never break the request.
  }
}
