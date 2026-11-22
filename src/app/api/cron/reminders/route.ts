import { NextResponse, type NextRequest } from "next/server";
import { hasCronSecret } from "@/lib/cron/auth";
import { timeBudget, workSeconds } from "@/lib/cron/budget";
import { eachLimit } from "@/lib/concurrency";
import { createClient } from "@supabase/supabase-js";
import { readAll, readByIds } from "@/lib/data/paged";
import { buildDigest } from "@/lib/reminders/digest";
import { renderDigestEmail, sendEmail } from "@/lib/reminders/email";
import { isLang, makeT } from "@/lib/i18n/core";
import { DEFAULT_TZ, addDays, dateKey } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily teacher digest, called by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Needs SUPABASE_SECRET_KEY, RESEND_API_KEY and REMINDER_FROM; without them it does nothing.
 * `?dry=1` builds the digests without sending or logging anything.
 *
 * Many teachers: the run works through them a few at a time until its time budget is spent and
 * reports the rest as `deferred`; the second daily run (vercel.json) sends those, because
 * reminder_log skips every teacher who already got today's e-mail.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!hasCronSecret(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const budget = timeBudget(workSeconds(maxDuration));
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

  const { data: teachers, error } = await readAll<{ user_id: string }>((a, b) =>
    db.from("teacher_profiles").select("user_id").eq("email_reminders", true).order("user_id").range(a, b), 500_000);
  if (error || !teachers) return NextResponse.json({ error: "apply supabase/migrations/0004_email_reminders.sql", detail: error?.message }, { status: 503 });
  const ids = teachers.map(r => r.user_id);

  // Profiles and today's log for everybody up front (a few requests instead of two per teacher).
  // "Today" is the teacher's own day, which is yesterday, today or tomorrow in UTC.
  const utcToday = now.toISOString().slice(0, 10);
  const [profiles, logs] = await Promise.all([
    readByIds(ids, chunk => db.from("profiles").select("id, full_name, timezone, preferred_language").in("id", chunk)),
    readByIds(ids, chunk => db.from("reminder_log").select("teacher_id, sent_on").in("teacher_id", chunk).gte("sent_on", addDays(utcToday, -1)).lte("sent_on", addDays(utcToday, 1)))
  ]);
  const profileOf = new Map((profiles.data ?? []).map(p => [p.id as string, p as { full_name: string | null; timezone: string | null; preferred_language: string | null }]));
  const sentOn = new Set((logs.data ?? []).map(r => `${r.teacher_id}|${r.sent_on}`));

  const result = { teachers: ids.length, sent: 0, empty: 0, alreadySent: 0, failed: 0, deferred: 0, preview: [] as string[] };
  await eachLimit(ids, 6, async teacherId => {
    const profile = profileOf.get(teacherId);
    const tz = profile?.timezone || DEFAULT_TZ;
    const today = dateKey(now, tz);
    if (sentOn.has(`${teacherId}|${today}`)) { result.alreadySent++; return; }
    if (budget.spent()) { result.deferred++; return; }
    try {
      const windowEnd = new Date(`${addDays(today, 3)}T00:00:00Z`).toISOString();
      const [lessons, homework, payments, students] = await Promise.all([
        readAll((a, b) => db.from("lessons").select("id, title, starts_at, ends_at, status, meeting_url, student_id").eq("teacher_id", teacherId).gte("starts_at", now.toISOString()).lt("starts_at", windowEnd).order("starts_at").order("id").range(a, b), 5000),
        readAll((a, b) => db.from("homework").select("id, title, status, student_id").eq("teacher_id", teacherId).eq("status", "submitted").order("id").range(a, b), 5000),
        readAll((a, b) => db.from("payments").select("id, amount, currency, status, due_date, student_id").eq("teacher_id", teacherId).eq("status", "pending").order("id").range(a, b), 10_000),
        readAll((a, b) => db.from("students").select("id, full_name").eq("teacher_id", teacherId).order("id").range(a, b), 20_000)
      ]);

      const t = makeT(isLang(profile?.preferred_language) ? profile.preferred_language : "ro");
      const digest = buildDigest({
        timezone: tz,
        lessons: lessons.data ?? [],
        homework: homework.data ?? [],
        payments: (payments.data ?? []).map(p => ({ ...p, amount: Number(p.amount) })),
        students: students.data ?? []
      }, now, t);
      if (!digest.hasContent) { result.empty++; return; }
      if (dry) { result.preview.push(digest.subject); return; }

      const { data: user } = await db.auth.admin.getUserById(teacherId);
      const to = user.user?.email;
      if (!to) { result.failed++; return; }
      const name = profile?.full_name?.split(" ")[0] || to.split("@")[0];
      await sendEmail({ to, ...renderDigestEmail(digest, t, { name, appUrl }) }, { apiKey: resendKey!, from: from! });
      await db.from("reminder_log").insert({ teacher_id: teacherId, sent_on: today });
      result.sent++;
    } catch (e) {
      result.failed++;
      console.error("reminder failed", teacherId, e instanceof Error ? e.message : e);
    }
  });
  if (result.deferred) console.warn(`[reminders] time budget spent, ${result.deferred} teachers left for the next run`);
  return NextResponse.json(result);
}
