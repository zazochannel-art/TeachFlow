import { type NextRequest } from "next/server";
import { loadWorkspace } from "@/lib/data/workspace";
import { loadTeacherQuizzes } from "@/lib/data/quizzes";
import { buildMonthlyReport, isMonthKey, monthRange, previousMonth, renderReportEmail } from "@/lib/reports/monthly";
import { getT } from "@/lib/i18n/server";

/** The teacher's preview of the monthly parent report of one student (same e-mail the parents get). */
export async function GET(request: NextRequest) {
  const [ws, quizData, t] = await Promise.all([loadWorkspace(), loadTeacherQuizzes(), getT()]);
  const id = request.nextUrl.searchParams.get("student");
  const s = ws.students.find(x => x.id === id);
  if (!s) return new Response("Not found", { status: 404 });
  const m = request.nextUrl.searchParams.get("month");
  const month = isMonthKey(m) ? m : previousMonth(new Date(), ws.timezone);
  const { end } = monthRange(month, ws.timezone);
  const courseIds = new Set(ws.enrollments.filter(e => e.student_id === s.id && e.status !== "completed").map(e => e.course_id));
  const lessons = ws.lessons.filter(l => l.student_id === s.id || (!l.student_id && l.course_id && courseIds.has(l.course_id)));
  const nextEnd = new Date(end.getTime() + 32 * 86400000);
  const report = buildMonthlyReport({
    timezone: ws.timezone, month, studentName: s.full_name, teacherName: ws.profile?.full_name || t("Profesor"),
    courses: ws.courses,
    lessons: lessons.filter(l => new Date(l.starts_at) < end),
    homework: ws.homework.filter(h => h.student_id === s.id),
    quizzes: quizData.assignments.filter(a => a.student_id === s.id),
    payments: ws.payments.filter(p => p.student_id === s.id),
    nextMonthLessons: lessons.filter(l => l.status === "scheduled" && new Date(l.starts_at) >= end && new Date(l.starts_at) < nextEnd).length
  }, t);
  const { html } = renderReportEmail(report, t, { studentName: s.full_name, teacherName: ws.profile?.full_name || t("Profesor"), appUrl: request.nextUrl.origin, hasAccount: true });
  const banner = `<div style="font-family:Arial,sans-serif;background:#1d1b4b;color:#fff;padding:10px 16px;font-size:13px">${t("Previzualizare · așa arată emailul pe care îl primesc părinții la începutul lunii.")}${report.hasContent ? "" : ` ${t("Luna aceasta nu are nimic de raportat, deci nu se trimite.")}`}</div>`;
  return new Response(html.replace(/(<body[^>]*>)/, `$1${banner}`), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
