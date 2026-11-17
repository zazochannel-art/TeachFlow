import { NextResponse, type NextRequest } from "next/server";
import { reportError } from "@/lib/monitoring";
import { clientIp, createRateLimiter, isCrossSite } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A browser in trouble sends a handful of reports; more than that from one address is noise or abuse.
const perIp = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * Errors from the browser (ErrorReporter, error pages). Small JSON only; anything odd is dropped.
 * Open to signed-out visitors (login pages can fail too), so it accepts only same-site requests and
 * a few reports a minute per address. Always answers 204 so it tells a prober nothing.
 */
export async function POST(request: NextRequest) {
  const none = new NextResponse(null, { status: 204 });
  if (isCrossSite(request.headers, request.headers.get("host"))) return none;
  if (!perIp.take(clientIp(request.headers))) return none;
  if (!(request.headers.get("content-type") ?? "").includes("json")) return none;
  const raw = await request.text();
  if (raw.length > 8000) return none;
  try {
    const body = JSON.parse(raw) as { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      await reportError({
        source: "browser",
        message: body.message,
        stack: typeof body.stack === "string" ? body.stack : undefined,
        path: typeof body.path === "string" ? body.path : undefined,
        digest: typeof body.digest === "string" ? body.digest : undefined
      });
    }
  } catch {
    // Not JSON: ignore.
  }
  return none;
}
