import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callTransport, connectionSuffix, liveKitConfig, liveKitRoomName, liveKitToken, lessonCallIdentity, publishSources, UUID_RE } from "@/lib/call/tokens";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * LiveKit (SFU) access token for a group lesson call. The token is signed here with
 * LIVEKIT_API_SECRET, which never leaves the server; it lets exactly this user join exactly this
 * lesson's room for a few hours, with the name and role taken from the database (not from the browser).
 */
export async function POST(req: NextRequest) {
  const cfg = liveKitConfig();
  if (!cfg) return json({ error: "sfu_not_configured" }, 501);

  const supabase = await createClient();
  if (!supabase) return json({ error: "unavailable" }, 503);
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as { lessonId?: unknown } | null;
  const lessonId = typeof body?.lessonId === "string" ? body.lessonId : "";
  if (!UUID_RE.test(lessonId)) return json({ error: "bad_request" }, 400);

  const who = await lessonCallIdentity(supabase, userId, lessonId);
  if (who === "missing") return json({ error: "migration_0018_missing" }, 503);
  if (!who) return json({ error: "forbidden" }, 403);

  // Only lessons that use the SFU get a token (RLS lets members read their lesson).
  const { data: lesson } = await supabase.from("lessons").select("course_id, student_id").eq("id", lessonId).maybeSingle();
  if (!lesson || callTransport(lesson) !== "sfu") return json({ error: "not_sfu" }, 409);

  // Students share the screen only when the teacher allowed it (lesson_screen_access, 0021); the
  // LiveKit server enforces it. Before migration 0021 everybody may, as before.
  let screen = true;
  if (who.role === "student") {
    const { data: access, error } = await supabase.from("lesson_screen_access").select("user_id").eq("lesson_id", lessonId).eq("user_id", userId).maybeSingle();
    screen = error ? true : !!access;
  }

  const identity = `${userId}:${connectionSuffix()}`;
  const token = liveKitToken(cfg, {
    identity,
    name: who.name,
    room: liveKitRoomName(lessonId),
    metadata: { role: who.role, userId },
    sources: publishSources(screen)
  });
  return json({ url: cfg.url, token, identity });
}
