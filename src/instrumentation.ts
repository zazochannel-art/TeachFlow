import type { Instrumentation } from "next";
import { isControlFlow, reportError } from "@/lib/monitoring";

/** Server errors in pages, route handlers, server actions and the proxy (see lib/monitoring). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (isControlFlow(err)) return;
  await reportError({
    source: "server",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined,
    path: request.path,
    kind: `${context.routeType} ${context.routePath}`
  });
};
