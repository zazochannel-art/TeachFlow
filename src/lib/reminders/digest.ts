import { addDays, dateKey, dayRange, formatDate, formatMoney, formatTime } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

/** Rows of one teacher, as loaded by the reminder job. */
export interface DigestInput {
  timezone: string;
  lessons: Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string; meeting_url: string | null; student_id: string | null }>;
  homework: Array<{ id: string; title: string; status: string; student_id: string }>;
  payments: Array<{ id: string; amount: number; currency: string; status: string; due_date: string | null; student_id: string }>;
  students: Array<{ id: string; full_name: string }>;
}

export interface Digest {
  subject: string;
  tomorrow: string[];
  noLink: number;
  review: string[];
  overdue: string[];
  /** False when there is nothing worth an email. */
  hasContent: boolean;
}

/** What one teacher should hear about this morning: tomorrow's lessons, homework to review, overdue payments. */
export function buildDigest(input: DigestInput, now: Date, t: T): Digest {
  const tz = input.timezone;
  const today = dateKey(now, tz);
  const { start, end } = dayRange(addDays(today, 1), tz);
  const name = new Map(input.students.map(s => [s.id, s.full_name]));

  const tomorrowLessons = input.lessons
    .filter(l => l.status === "scheduled" && new Date(l.starts_at) >= start && new Date(l.starts_at) < end)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const tomorrow = tomorrowLessons.map(l => {
    const who = l.student_id ? name.get(l.student_id) : null;
    const time = `${formatTime(l.starts_at, tz, t.locale)}–${formatTime(l.ends_at, tz, t.locale)}`;
    return `${time} · ${l.title}${who && !l.title.includes(who) ? ` · ${who}` : ""}${l.meeting_url ? "" : ` (${t("fără link")})`}`;
  });
  const noLink = tomorrowLessons.filter(l => !l.meeting_url).length;

  const review = input.homework
    .filter(h => h.status === "submitted")
    .map(h => `${h.title} · ${name.get(h.student_id) ?? t("Elev")}`);

  const overdue = input.payments
    .filter(p => p.status === "pending" && p.due_date && p.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .map(p => `${name.get(p.student_id) ?? t("Elev")} · ${formatMoney(p.amount, p.currency, t.locale)} · ${t("termen {date}", { date: formatDate(`${p.due_date}T12:00:00Z`, "UTC", t.locale) })}`);

  const parts = [
    tomorrow.length ? t.n("{n} lecție mâine|{n} lecții mâine|{n} de lecții mâine", tomorrow.length) : null,
    review.length ? t.n("{n} temă de verificat|{n} teme de verificat|{n} de teme de verificat", review.length) : null,
    overdue.length ? t.n("{n} plată restantă|{n} plăți restante|{n} de plăți restante", overdue.length) : null
  ].filter(Boolean);

  return {
    subject: parts.length ? `TeachFlow · ${parts.join(" · ")}` : "TeachFlow",
    tomorrow, noLink, review, overdue,
    hasContent: parts.length > 0
  };
}
