import { NextResponse, type NextRequest } from "next/server";
import { connectionSuffix, harnessEnabled, liveKitConfig, liveKitRoomName, liveKitToken } from "@/lib/call/tokens";

export const dynamic = "force-dynamic";

/**
 * LiveKit token for the automated call test harness only. It signs tokens for any room without a
 * sign-in, so it exists only with RTC_TEST_HARNESS=1 and never on Vercel, even if that variable is
 * set there by mistake.
 */
export async function POST(req: NextRequest) {
  const cfg = liveKitConfig();
  if (!harnessEnabled() || !cfg) return new NextResponse(null, { status: 404 });
  const q = req.nextUrl.searchParams;
  const id = (q.get("id") ?? "x").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const token = liveKitToken(cfg, {
    identity: `${id}:${connectionSuffix()}`,
    name: (q.get("name") ?? id).slice(0, 60),
    room: liveKitRoomName((q.get("lesson") ?? "").replace(/[^0-9a-f-]/gi, "").slice(0, 36) || "test"),
    metadata: { role: q.get("role") === "teacher" ? "teacher" : "student" }
  });
  return NextResponse.json({ url: cfg.url, token });
}
