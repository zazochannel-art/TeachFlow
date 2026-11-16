import { NextResponse, type NextRequest } from "next/server";
import { reportError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/** Errors from the browser (ErrorReporter, error pages). Small JSON only; anything odd is dropped. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 8000) return new NextResponse(null, { status: 204 });
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
  return new NextResponse(null, { status: 204 });
}
