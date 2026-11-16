import { NextResponse, type NextRequest } from "next/server";
import { eachLimit } from "@/lib/concurrency";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/reminders/email";
import { buildMonthlyReport, isMonthKey, monthRange, previousMonth, renderReportEmail } from "@/lib/reports/monthly";
import { isLang, makeT, type Lang } from "@/lib/i18n/core";
import { DEFAULT_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Monthly report for parents, called by Vercel Cron on the 1st of every month (vercel.json)
 * with `Authorization: Bearer $CRON_SECRET`. For each teacher with reports on, every active
 * student gets one e-mail per parent (parent accounts and the parent e-mail on the student card)
 * about the previous month. parent_report_log prevents duplicates; quiet months send nothing.
 * `?dry=1` builds the reports without sending; `?month=YYYY-MM` picks another month.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const forced = request.nextUrl.searchParams.get("month");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM;
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !serviceKey && "SUPABASE_SECRET_KEY", !dry && !resendKey && "RESEND_API_KEY", !dry && !from && "REMINDER_FROM"].filter(Boolean);
  if (missing.length) return NextResponse.json({ error: "not configured", missing }, { status: 503 });

  const db = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const appUrl = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const now = new Date();

  const { data: teachers, error } = await db.from("teacher_profiles").select("user_id").eq("parent_reports", true);
  if (error) return NextResponse.json({ error: "apply supabase/migrations/0013_library_quizzes_reports_push.sql", detail: error.message }, { status: 503 });

  const emailOf = async (uid: string) => (await db.auth.admin.getUserById(uid)).data.user?.email ?? null;
  const result = { teachers: teachers.length, students: 0, sent: 0, empty: 0, alreadySent: 0, noParents: 0, failed: 0, preview: [] as string[] };

  // A few teachers at a time: the job has to finish within maxDuration.
  await eachLimit(teachers, 3, async ({ user_id: teacherId }) => {
    try {
      const { data: profile } = await db.from("profiles").select("full_name, timezone, preferred_language").eq("id", teacherId).maybeSingle();
      const tz = profile?.timezone || DEFAULT_TZ;
      const teacherLang: Lang = isLang(profile?.preferred_language) ? profile.preferred_language : "ro";
      const month = isMonthKey(forced) ? forced : previousMonth(now, tz);
      const { start, end } = monthRange(month, tz);
      const nextEnd = new Date(monthRange(month, tz).end.getTime() + 32 * 86400000);

      const [students, links, courses, enrollments, lessons, homework, quizzes, payments] = await Promise.all([
        db.from("students").select("id, full_name, parent_email").eq("teacher_id", teacherId).eq("status", "active"),
        db.from("parent_links").select("student_id, user_id").eq("teacher_id", teacherId),
        db.from("courses").select("id, title").eq("teacher_id", teacherId),
        db.from("course_enrollments").select("course_id, student_id, status").eq("teacher_id", teacherId),
        db.from("lessons").select("id, title, starts_at, status, course_id, student_id").eq("teacher_id", teacherId).gte("starts_at", start.toISOString()).lt("starts_at", nextEnd.toISOString()).limit(5000),
        db.from("homework").select("id, title, status, grade, due_at, submitted_at, created_at, student_id").eq("teacher_id", teacherId).gte("created_at", new Date(start.getTime() - 62 * 86400000).toISOString()).limit(5000),
        db.from("quiz_assignments").select("id, title, status, score, max_score, submitted_at, student_id").eq("teacher_id", teacherId).gte("submitted_at", start.toISOString()).lt("submitted_at", end.toISOString()).limit(5000),
        db.from("payments").select("amount, currency, status, due_date, student_id").eq("teacher_id", teacherId).eq("status", "pending").limit(5000)
      ]);
      const teacherName = profile?.full_name || makeT(teacherLang)("Profesor");
      let replyTo: string | null | undefined;

      for (const s of students.data ?? []) {
        result.students++;
        const courseIds = new Set((enrollments.data ?? []).filter(e => e.student_id === s.id && e.status !== "completed").map(e => e.course_id as string));
        const mine = (lessons.data ?? []).filter(l => l.student_id === s.id || (!l.student_id && l.course_id && courseIds.has(l.course_id)));
        const input = {
          timezone: tz, month, studentName: s.full_name, teacherName,
          courses: courses.data ?? [],
          lessons: mine.filter(l => new Date(l.starts_at) < end),
          homework: (homework.data ?? []).filter(h => h.student_id === s.id),
          quizzes: (quizzes.data ?? []).filter(q => q.student_id === s.id).map(q => ({ ...q, score: q.score == null ? null : Number(q.score), max_score: q.max_score == null ? null : Number(q.max_score) })),
          payments: (payments.data ?? []).filter(p => p.student_id === s.id).map(p => ({ ...p, amount: Number(p.amount) })),
          nextMonthLessons: mine.filter(l => new Date(l.starts_at) >= end && l.status === "scheduled").length
        };

        // Recipients: parent accounts (in their own language) and the parent e-mail on the card.
        const recipients = new Map<string, { lang: Lang; hasAccount: boolean }>();
        for (const l of (links.data ?? []).filter(x => x.student_id === s.id)) {
          const email = await emailOf(l.user_id as string);
          if (!email) continue;
          const { data: pp } = await db.from("profiles").select("preferred_language").eq("id", l.user_id).maybeSingle();
          recipients.set(email.toLowerCase(), { lang: isLang(pp?.preferred_language) ? pp.preferred_language : teacherLang, hasAccount: true });
        }
        const cardEmail = (s.parent_email as string | null)?.trim().toLowerCase();
        if (cardEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cardEmail) && !recipients.has(cardEmail)) recipients.set(cardEmail, { lang: teacherLang, hasAccount: false });
        if (!recipients.size) { result.noParents++; continue; }

        if (!buildMonthlyReport(input, makeT(teacherLang)).hasContent) { result.empty++; continue; }
        for (const [to, r] of recipients) {
          const { data: logged } = await db.from("parent_report_log").select("student_id").eq("student_id", s.id).eq("recipient", to).eq("month", `${month}-01`).maybeSingle();
          if (logged) { result.alreadySent++; continue; }
          const t = makeT(r.lang);
          const report = buildMonthlyReport(input, t);
          if (dry) { result.preview.push(`${report.subject} → ${to.replace(/^(.).*@/, "$1…@")}`); continue; }
          if (replyTo === undefined) replyTo = await emailOf(teacherId);
          await sendEmail({ to, replyTo: replyTo ?? undefined, ...renderReportEmail(report, t, { studentName: s.full_name, teacherName, appUrl, hasAccount: r.hasAccount }) }, { apiKey: resendKey!, from: from! });
          await db.from("parent_report_log").insert({ student_id: s.id, recipient: to, month: `${month}-01` });
          result.sent++;
        }
      }
    } catch (e) {
      result.failed++;
      console.error("parent report failed", teacherId, e instanceof Error ? e.message : e);
    }
  });
  return NextResponse.json(result);
}
