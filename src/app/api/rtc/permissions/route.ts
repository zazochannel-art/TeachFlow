import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callTransport, lessonCallIdentity, liveKitConfig, liveKitRoomName, syncScreenPermission, UUID_RE } from "@/lib/call/tokens";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The teacher allowed or took back a student's screen share during a group (SFU) call. The change
 * is already in lesson_screen_access; this applies it to the student's connections that are in the
 * LiveKit room right now (new connections get it in their token). Only the lesson's teacher may
 * call it, and the permission is read from the database, not from the request.
 */
export async function POST(req: NextRequest) {
  const cfg = liveKitConfig();
  if (!cfg) return json({ updated: 0, sfu: false });

  const supabase = await createClient();
  if (!supabase) return json({ error: "unavailable" }, 503);
  const { data } = await supabase.auth.getClaims();
  const teacherId = data?.claims?.sub;
  if (!teacherId) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as { lessonId?: unknown; userId?: unknown } | null;
  const lessonId = typeof body?.lessonId === "string" ? body.lessonId : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(lessonId) || !UUID_RE.test(userId)) return json({ error: "bad_request" }, 400);

  const who = await lessonCallIdentity(supabase, teacherId, lessonId);
  if (who === "missing") return json({ error: "migration_0018_missing" }, 503);
  if (!who || who.role !== "teacher") return json({ error: "forbidden" }, 403);

  const { data: lesson } = await supabase.from("lessons").select("course_id, student_id").eq("id", lessonId).maybeSingle();
  if (!lesson || callTransport(lesson) !== "sfu") return json({ updated: 0, sfu: false });

  const { data: access, error } = await supabase.from("lesson_screen_access").select("user_id").eq("lesson_id", lessonId).eq("user_id", userId).maybeSingle();
  if (error) return json({ error: "migration_0021_missing" }, 503);

  try {
    const updated = await syncScreenPermission(cfg, liveKitRoomName(lessonId), userId, !!access);
    return json({ updated, sfu: true });
  } catch (err) {
    // A room that does not exist yet (nobody in the call) is not a problem: the token decides.
    console.error("[rtc] screen permission sync failed:", err instanceof Error ? err.message : err);
    return json({ error: "sync_failed" }, 502);
  }
}
