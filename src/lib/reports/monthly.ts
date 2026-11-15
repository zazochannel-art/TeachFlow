import type { T } from "@/lib/i18n/core";
import { formatDate, formatMoney, formatTime, zonedToUtc } from "@/lib/time";

// Monthly report for parents (migration 0013): what happened in one calendar month for one child.

export interface ReportInput {
  timezone: string;
  /** "YYYY-MM" */
  month: string;
  studentName: string;
  teacherName: string;
  courses: Array<{ id: string; title: string }>;
  lessons: Array<{ id: string; title: string; starts_at: string; status: string; course_id: string | null }>;
  homework: Array<{ id: string; title: string; status: string; grade: string | null; due_at: string | null; submitted_at: string | null; created_at: string }>;
  quizzes: Array<{ id: string; title: string; status: string; score: number | null; max_score: number | null; submitted_at: string | null }>;
  /** Payments still pending (any month). */
  payments: Array<{ amount: number; currency: string; status: string; due_date: string | null }>;
  /** Lessons already scheduled for next month (count). */
  nextMonthLessons?: number;
}

export interface MonthlyReport {
  month: string;
  monthLabel: string;
  subject: string;
  lessons: { held: number; missed: number; cancelled: number; list: string[] };
  attendance: number | null;
  homework: { given: number; handedIn: number; onTime: number; grades: string[] };
  quizzes: { done: number; average: number | null; list: string[] };
  payments: { pending: string | null; overdue: boolean };
  nextMonthLessons: number;
  hasContent: boolean;
}

/** UTC bounds of a calendar month in a time zone. */
export function monthRange(month: string, tz: string) {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start: zonedToUtc(y, m, 1, 0, 0, tz), end: zonedToUtc(ny, nm, 1, 0, 0, tz) };
}

/** "YYYY-MM" of the month before the one containing `now` in `tz`. */
export function previousMonth(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(parts.find(p => p.type === "year")!.value);
  const m = Number(parts.find(p => p.type === "month")!.value);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const isMonthKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function monthLabel(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number);
  const s = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildMonthlyReport(input: ReportInput, t: T): MonthlyReport {
  const tz = input.timezone;
  const { start, end } = monthRange(input.month, tz);
  const inMonth = (iso: string | null | undefined) => !!iso && new Date(iso) >= start && new Date(iso) < end;
  const label = monthLabel(input.month, t.locale);

  const lessons = input.lessons.filter(l => inMonth(l.starts_at)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const held = lessons.filter(l => l.status === "completed");
  const missed = lessons.filter(l => l.status === "no_show");
  const cancelled = lessons.filter(l => l.status === "cancelled");
  const counted = held.length + missed.length;
  const lessonList = [...held, ...missed].map(l =>
    `${formatDate(l.starts_at, tz, t.locale)}, ${formatTime(l.starts_at, tz, t.locale)} · ${l.title}${l.status === "no_show" ? ` · ${t("absent")}` : ""}`);

  // Homework of the month: given this month, or due this month.
  const hw = input.homework.filter(h => inMonth(h.created_at) || inMonth(h.due_at));
  const handedIn = hw.filter(h => h.status !== "assigned");
  const onTime = handedIn.filter(h => !h.due_at || !h.submitted_at || new Date(h.submitted_at) <= new Date(h.due_at));
  const grades = hw.filter(h => h.status === "reviewed" && h.grade).map(h => `${h.title}: ${h.grade}`);

  const quizzes = input.quizzes.filter(q => q.status === "submitted" && inMonth(q.submitted_at) && q.max_score);
  const average = quizzes.length ? Math.round(quizzes.reduce((s, q) => s + (Number(q.score) / Number(q.max_score)) * 100, 0) / quizzes.length) : null;
  const quizList = quizzes.map(q => `${q.title}: ${Number(q.score)}/${Number(q.max_score)} (${Math.round((Number(q.score) / Number(q.max_score)) * 100)}%)`);

  const pending = input.payments.filter(p => p.status === "pending");
  const totals = new Map<string, number>();
  for (const p of pending) totals.set(p.currency, (totals.get(p.currency) ?? 0) + Number(p.amount));
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return {
    month: input.month,
    monthLabel: label,
    subject: t("{name} · raportul lunii {month}", { name: input.studentName, month: label.toLowerCase() }),
    lessons: { held: held.length, missed: missed.length, cancelled: cancelled.length, list: lessonList },
    attendance: counted ? Math.round((held.length / counted) * 100) : null,
    homework: { given: hw.length, handedIn: handedIn.length, onTime: onTime.length, grades },
    quizzes: { done: quizzes.length, average, list: quizList },
    payments: {
      pending: totals.size ? [...totals].map(([c, a]) => formatMoney(a, c, t.locale)).join(" + ") : null,
      overdue: pending.some(p => p.due_date && p.due_date < todayKey)
    },
    nextMonthLessons: input.nextMonthLessons ?? 0,
    hasContent: lessons.length > 0 || hw.length > 0 || quizzes.length > 0
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** HTML (inline styles) and text versions of the report e-mail. */
export function renderReportEmail(r: MonthlyReport, t: T, opts: { studentName: string; teacherName: string; appUrl: string; hasAccount: boolean }) {
  const stats = [
    { label: t("Lecții făcute"), value: String(r.lessons.held) },
    { label: t("Absențe"), value: String(r.lessons.missed) },
    { label: t("Teme predate"), value: `${r.homework.handedIn}/${r.homework.given}` },
    { label: t("Media la teste"), value: r.quizzes.average != null ? `${r.quizzes.average}%` : "—" }
  ];
  const sections: Array<{ title: string; items: string[]; note?: string | null }> = [
    { title: t("Lecții"), items: r.lessons.list, note: r.attendance != null ? t("Prezență: {n}%", { n: r.attendance }) + (r.lessons.cancelled ? ` · ${t.n("{n} lecție anulată|{n} lecții anulate|{n} de lecții anulate", r.lessons.cancelled)}` : "") : null },
    { title: t("Note la teme"), items: r.homework.grades, note: r.homework.given ? t("{done} din {total} teme predate, {onTime} la timp", { done: r.homework.handedIn, total: r.homework.given, onTime: r.homework.onTime }) : null },
    { title: t("Teste"), items: r.quizzes.list }
  ].filter(s => s.items.length || s.note);

  const hello = t("Bună ziua!");
  const intro = t("Iată cum a fost luna {month} pentru {name} la {teacher}.", { month: r.monthLabel.toLowerCase(), name: opts.studentName, teacher: opts.teacherName });
  const pay = r.payments.pending ? t("De achitat: {amount}", { amount: r.payments.pending }) + (r.payments.overdue ? ` · ${t("există plăți restante")}` : "") : null;
  const next = r.nextMonthLessons ? t.n("Luna aceasta sunt programate deja {n} lecție.|Luna aceasta sunt programate deja {n} lecții.|Luna aceasta sunt programate deja {n} de lecții.", r.nextMonthLessons) : null;
  const cta = opts.hasAccount ? { href: `${opts.appUrl}/parent`, label: t("Vezi detaliile în TeachFlow") } : null;
  const footer = t("Raport trimis automat de TeachFlow în numele profesorului. Pentru întrebări, răspunde la acest email.");

  const html = `<!doctype html><html lang="${t.lang}"><body style="margin:0;background:#f1f2ff;font-family:Arial,Helvetica,sans-serif;color:#1d1b4b">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:20px;padding:28px">
<p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#5269e8;text-transform:uppercase;letter-spacing:.5px">${esc(t("Raport lunar"))} · ${esc(r.monthLabel)}</p>
<p style="margin:0 0 4px;font-size:20px;font-weight:bold">${esc(opts.studentName)}</p>
<p style="margin:12px 0 4px;font-size:14px">${esc(hello)}</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b6f93">${esc(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:6px 0"><tr>
${stats.map(s => `<td style="background:#f1f2ff;border-radius:14px;padding:12px 8px;text-align:center;width:25%"><div style="font-size:20px;font-weight:bold">${esc(s.value)}</div><div style="font-size:11px;color:#6b6f93">${esc(s.label)}</div></td>`).join("")}
</tr></table>
${sections.map(s => `<p style="margin:22px 0 8px;font-size:15px;font-weight:bold">${esc(s.title)}</p>
${s.note ? `<p style="margin:0 0 6px;font-size:13px;color:#6b6f93">${esc(s.note)}</p>` : ""}
${s.items.length ? `<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${s.items.slice(0, 40).map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}`).join("\n")}
${pay ? `<p style="margin:22px 0 0;padding:12px 14px;border-radius:12px;background:${r.payments.overdue ? "#fdecec" : "#fff8e8"};font-size:13px;color:${r.payments.overdue ? "#a12b2b" : "#7a5410"}">${esc(pay)}</p>` : ""}
${next ? `<p style="margin:16px 0 0;font-size:13px;color:#6b6f93">${esc(next)}</p>` : ""}
${cta ? `<p style="margin:22px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#5269e8;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:10px 18px;border-radius:12px">${esc(cta.label)}</a></p>` : ""}
</div>
<p style="margin:16px 8px 0;font-size:11px;color:#8a8fb3">${esc(footer)}</p>
</div></body></html>`;

  const text = [
    `${t("Raport lunar")} · ${r.monthLabel} · ${opts.studentName}`, "", hello, intro, "",
    ...stats.map(s => `${s.label}: ${s.value}`), "",
    ...sections.flatMap(s => [s.title.toUpperCase(), ...(s.note ? [s.note] : []), ...s.items.slice(0, 40).map(i => `- ${i}`), ""]),
    ...(pay ? [pay, ""] : []), ...(next ? [next, ""] : []), ...(cta ? [`${cta.label}: ${cta.href}`, ""] : []), footer
  ].join("\n");
  return { subject: r.subject, html, text };
}
