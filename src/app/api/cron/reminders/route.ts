import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDigest } from "@/lib/reminders/digest";
import { renderDigestEmail, sendEmail } from "@/lib/reminders/email";
import { isLang, makeT } from "@/lib/i18n/core";
import { DEFAULT_TZ, addDays, dateKey } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily teacher digest, called by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Needs SUPABASE_SECRET_KEY, RESEND_API_KEY and REMINDER_FROM; without them it does nothing.
 * `?dry=1` builds the digests without sending or logging anything.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM;
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !serviceKey && "SUPABASE_SECRET_KEY", !dry && !resendKey && "RESEND_API_KEY", !dry && !from && "REMINDER_FROM"].filter(Boolean);
  if (missing.length) return NextResponse.json({ error: "not configured", missing }, { status: 503 });

  const db = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const appUrl = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const now = new Date();

  const { data: teachers, error } = await db.from("teacher_profiles").select("user_id").eq("email_reminders", true);
  if (error) return NextResponse.json({ error: "apply supabase/migrations/0004_email_reminders.sql", detail: error.message }, { status: 503 });

  const result = { teachers: teachers.length, sent: 0, empty: 0, alreadySent: 0, failed: 0, preview: [] as string[] };
  for (const { user_id: teacherId } of teachers) {
    try {
      const { data: profile } = await db.from("profiles").select("full_name, timezone, preferred_language").eq("id", teacherId).maybeSingle();
      const tz = profile?.timezone || DEFAULT_TZ;
      const today = dateKey(now, tz);

      const { data: logged } = await db.from("reminder_log").select("teacher_id").eq("teacher_id", teacherId).eq("sent_on", today).maybeSingle();
      if (logged) { result.alreadySent++; continue; }

      const windowEnd = new Date(`${addDays(today, 3)}T00:00:00Z`).toISOString();
      const [lessons, homework, payments, students] = await Promise.all([
        db.from("lessons").select("id, title, starts_at, ends_at, status, meeting_url, student_id").eq("teacher_id", teacherId).gte("starts_at", now.toISOString()).lt("starts_at", windowEnd),
        db.from("homework").select("id, title, status, student_id").eq("teacher_id", teacherId).eq("status", "submitted"),
        db.from("payments").select("id, amount, currency, status, due_date, student_id").eq("teacher_id", teacherId).eq("status", "pending"),
        db.from("students").select("id, full_name").eq("teacher_id", teacherId)
      ]);

      const t = makeT(isLang(profile?.preferred_language) ? profile.preferred_language : "ro");
      const digest = buildDigest({
        timezone: tz,
        lessons: lessons.data ?? [],
        homework: homework.data ?? [],
        payments: (payments.data ?? []).map(p => ({ ...p, amount: Number(p.amount) })),
        students: students.data ?? []
      }, now, t);
      if (!digest.hasContent) { result.empty++; continue; }
      if (dry) { result.preview.push(digest.subject); continue; }

      const { data: user } = await db.auth.admin.getUserById(teacherId);
      const to = user.user?.email;
      if (!to) { result.failed++; continue; }
      const name = profile?.full_name?.split(" ")[0] || to.split("@")[0];
      await sendEmail({ to, ...renderDigestEmail(digest, t, { name, appUrl }) }, { apiKey: resendKey!, from: from! });
      await db.from("reminder_log").insert({ teacher_id: teacherId, sent_on: today });
      result.sent++;
    } catch (e) {
      result.failed++;
      console.error("reminder failed", teacherId, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json(result);
}
