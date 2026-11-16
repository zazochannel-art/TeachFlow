import { NextResponse, type NextRequest } from "next/server";
import { connectionSuffix, liveKitConfig, liveKitRoomName, liveKitToken } from "@/lib/call/tokens";

export const dynamic = "force-dynamic";

/** LiveKit token for the automated call test harness only (RTC_TEST_HARNESS=1, never on Vercel). */
export async function POST(req: NextRequest) {
  const cfg = liveKitConfig();
  if (process.env.RTC_TEST_HARNESS !== "1" || !cfg) return new NextResponse(null, { status: 404 });
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
