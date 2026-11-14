import type { Workspace } from "./workspace";
import type { Course, Lesson } from "@/types/database";
import { dayRange, formatDate, formatTime, initials } from "@/lib/time";
import { makeT, type T } from "@/lib/i18n/core";

const RO = makeT("ro");

export type SubjectKind = "language" | "math" | "music" | "art" | "science" | "code" | "other";

export function subjectKind(subject: string | null, title = ""): SubjectKind {
  const s = `${subject ?? ""} ${title}`.toLowerCase();
  if (/engl|rom[aâ]n|rus|fran|germ|span|ital|limb|language|lit/.test(s)) return "language";
  if (/mate|math|algebr|geometr/.test(s)) return "math";
  if (/muz|music|pian|chitar|vioar|vocal|canto/.test(s)) return "music";
  if (/art|desen|pictur|draw|design/.test(s)) return "art";
  if (/fiz|chim|biol|science|știin|stiin/.test(s)) return "science";
  if (/info|program|code|cod|it\b/.test(s)) return "code";
  return "other";
}

export interface CourseCard {
  id: string;
  title: string;
  subject: SubjectKind;
  format: Course["format"];
  studentCount: number;
  progress: number | null;
  lessonsDone: number;
  lessonsTotal: number;
  avatars: string[];
}

/** One compact card per active course, with real enrollment counts and lesson completion. */
export function courseCards(ws: Workspace, includeInactive = false): CourseCard[] {
  const studentName = new Map(ws.students.map(s => [s.id, s.full_name]));
  return ws.courses.filter(c => includeInactive || c.is_active).map(c => {
    const enrolled = ws.enrollments.filter(e => e.course_id === c.id && e.status === "active");
    const lessons = ws.lessons.filter(l => l.course_id === c.id && l.status !== "cancelled");
    const done = lessons.filter(l => l.status === "completed" || l.status === "no_show").length;
    return {
      id: c.id,
      title: c.title,
      subject: subjectKind(c.subject, c.title),
      format: c.format,
      studentCount: enrolled.length,
      progress: lessons.length ? Math.round((done / lessons.length) * 100) : null,
      lessonsDone: done,
      lessonsTotal: lessons.length,
      avatars: enrolled.slice(0, 3).map(e => initials(studentName.get(e.student_id) ?? "?"))
    };
  });
}

export interface Slot {
  id: string;
  title: string;
  subtitle: string;
  start: string;
  end: string;
  startsAt: string;
  meetingUrl: string | null;
  status: Lesson["status"];
  state: "past" | "now" | "next" | "later";
  subject: SubjectKind;
}

export function lessonSubtitle(ws: Workspace, l: Lesson) {
  const course = ws.courses.find(c => c.id === l.course_id);
  const student = ws.students.find(s => s.id === l.student_id);
  return [course && course.title !== l.title ? course.title : null, student?.full_name].filter(Boolean).join(" · ");
}

export function toSlot(ws: Workspace, l: Lesson, now: Date, nextId: string | null, t: T = RO): Slot {
  const start = new Date(l.starts_at).getTime();
  const end = new Date(l.ends_at).getTime();
  const ms = now.getTime();
  const course = ws.courses.find(c => c.id === l.course_id);
  let state: Slot["state"] = end <= ms ? "past" : start <= ms ? "now" : "later";
  if (state === "later" && l.id === nextId) state = "next";
  if (l.status === "cancelled" && state !== "past") state = "later";
  return {
    id: l.id, title: l.title, subtitle: lessonSubtitle(ws, l),
    start: formatTime(l.starts_at, ws.timezone, t.locale), end: formatTime(l.ends_at, ws.timezone, t.locale),
    startsAt: l.starts_at, meetingUrl: l.meeting_url, status: l.status, state,
    subject: subjectKind(course?.subject ?? null, l.title)
  };
}

export function lessonsBetween(ws: Workspace, start: Date, end: Date) {
  return ws.lessons.filter(l => {
    const s = new Date(l.starts_at);
    return s >= start && s < end;
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Lessons of one day. The lesson in progress (or, if none, the next one today) is highlighted. */
export function daySlots(ws: Workspace, key: string, now = new Date(), t: T = RO): Slot[] {
  const { start, end } = dayRange(key, ws.timezone);
  const lessons = lessonsBetween(ws, start, end);
  const current = currentLesson(ws, now);
  const nextId = current && !lessons.some(l => isNow(l, now)) ? current.id : null;
  return lessons.map(l => toSlot(ws, l, now, nextId, t));
}

function isNow(l: Lesson, now: Date) {
  return l.status === "scheduled" && new Date(l.starts_at) <= now && new Date(l.ends_at) > now;
}

/** Lesson in progress, otherwise the next scheduled lesson of today. */
export function currentLesson(ws: Workspace, now = new Date()) {
  const running = ws.lessons.find(l => isNow(l, now));
  if (running) return running;
  const { end } = dayRange(new Intl.DateTimeFormat("en-CA", { timeZone: ws.timezone }).format(now), ws.timezone);
  return ws.lessons.find(l => l.status === "scheduled" && new Date(l.starts_at) > now && new Date(l.starts_at) < end) ?? null;
}

export interface FeedItem {
  id: string;
  kind: "lesson" | "homework" | "student" | "payment" | "admin" | "prepare";
  title: string;
  body: string;
  emphasis?: string;
  highlight?: boolean;
  href?: string;
  external?: boolean;
  subject?: SubjectKind;
}

const DAY = 86400000;

/** Notifications derived from real rows: lessons, enrollments, students and the subscription. */
export function notifications(ws: Workspace, now = new Date(), t: T = RO): FeedItem[] {
  const items: FeedItem[] = [];
  const tz = ws.timezone;
  const time = (iso: string) => formatTime(iso, tz, t.locale);
  const date = (iso: string) => formatDate(iso, tz, t.locale);
  const cur = currentLesson(ws, now);
  if (cur) {
    const running = isNow(cur, now);
    items.push({
      id: `n-${cur.id}`, kind: "lesson", highlight: true,
      title: running ? t("E timpul lecției!") : t("Lecția următoare"),
      body: running ? t("a început la {time} · în desfășurare", { time: time(cur.starts_at) }) : t("astăzi la {time}", { time: time(cur.starts_at) }),
      emphasis: cur.title,
      href: `/classroom/${cur.id}`
    });
  }

  const studentName = new Map(ws.students.map(s => [s.id, s.full_name]));
  const courseTitle = new Map(ws.courses.map(c => [c.id, c.title]));

  const submitted = ws.homework.filter(h => h.status === "submitted").sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  if (submitted.length) {
    const h = submitted[0];
    items.push({
      id: `n-hw-${h.id}`, kind: "homework",
      title: submitted.length > 1 ? t("Teme predate") : studentName.get(h.student_id) ?? t("Elev"),
      emphasis: submitted.length > 1 ? String(submitted.length) : undefined,
      body: submitted.length > 1 ? t("teme noi · ultima de la {name}", { name: studentName.get(h.student_id) ?? t("un elev") }) : t("a predat tema „{title}”", { title: h.title }),
      href: "/homework?status=submitted", subject: subjectKind(h.course_id ? ws.courses.find(c => c.id === h.course_id)?.subject ?? null : null, h.title)
    });
  }

  const unread = ws.messages.filter(m => m.direction === "incoming" && !m.read_at);
  if (unread.length) {
    const m = unread[unread.length - 1];
    const who = studentName.get(m.student_id) ?? t("Elev");
    items.push({
      id: `n-msg-${m.id}`, kind: "student", title: unread.length > 1 ? t.n("{n} mesaj nou|{n} mesaje noi|{n} de mesaje noi", unread.length) : who,
      body: unread.length > 1 ? `${who}: ${m.body}` : m.body, href: `/messages?student=${m.student_id}`
    });
  }

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const overdue = ws.payments.filter(p => p.status === "pending" && p.due_date && p.due_date < todayKey);
  if (overdue.length) {
    const p = overdue[0];
    items.push({ id: `n-pay-${p.id}`, kind: "payment", title: studentName.get(p.student_id) ?? t("Plată"), emphasis: overdue.length > 1 ? t.n("{n} plată restantă|{n} plăți restante|{n} de plăți restante", overdue.length) : t("Plată restantă"), body: `· ${p.amount} ${p.currency}`, href: "/payments?status=overdue" });
  } else {
    const paid = ws.payments.filter(p => p.status === "paid" && p.paid_at && now.getTime() - new Date(p.paid_at).getTime() < 3 * DAY)[0];
    if (paid) items.push({ id: `n-paid-${paid.id}`, kind: "payment", title: studentName.get(paid.student_id) ?? t("Plată"), emphasis: `${paid.amount} ${paid.currency}`, body: t("încasat {date}", { date: date(paid.paid_at!) }), href: "/payments?status=paid" });
  }

  const recent = ws.lessons
    .filter(l => (l.status === "completed" || l.status === "no_show") && now.getTime() - new Date(l.ends_at).getTime() < 7 * DAY && new Date(l.ends_at) <= now)
    .slice(-2).reverse();
  for (const l of recent) {
    const card = courseCards(ws, true).find(c => c.id === l.course_id);
    items.push({
      id: `n-done-${l.id}`, kind: l.status === "no_show" ? "student" : "homework",
      title: l.title,
      emphasis: l.status === "no_show" ? t("Absență") : card?.progress != null ? `${card.progress}%` : t("Finalizată"),
      body: l.status === "no_show" ? t("elevul nu s-a prezentat · {date}", { date: date(l.starts_at) }) : t("din curs parcurs · lecție încheiată {date}", { date: date(l.starts_at) }),
      href: "/homework", subject: card?.subject
    });
  }

  ws.enrollments
    .filter(e => now.getTime() - new Date(e.enrolled_at).getTime() < 14 * DAY)
    .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at))
    .slice(0, 2)
    .forEach(e => items.push({
      id: `n-enr-${e.id}`, kind: "student",
      title: studentName.get(e.student_id) ?? t("Elev nou"),
      body: t("s-a înscris la {course}", { course: courseTitle.get(e.course_id) ?? t("un curs") }),
      href: "/students"
    }));

  const sub = ws.subscription;
  if (sub && (sub.status === "past_due" || sub.status === "expired")) {
    items.push({ id: "n-sub", kind: "payment", title: t("Abonament"), emphasis: sub.status === "past_due" ? t("Plată restantă") : t("Expirat"), body: t("actualizează metoda de plată"), href: "/payments" });
  } else if (sub?.status === "trialing" && sub.current_period_end) {
    items.push({ id: "n-sub", kind: "payment", title: t("Perioada de probă"), body: t("se încheie pe {date}", { date: date(sub.current_period_end) }), href: "/payments" });
  }
  return items.slice(0, 4);
}

/** Small counters for the sidebar. */
export function badges(ws: Workspace) {
  return {
    "/homework": ws.homework.filter(h => h.status === "submitted").length,
    "/messages": ws.messages.filter(m => m.direction === "incoming" && !m.read_at).length
  } as Record<string, number>;
}

/** Things the teacher should do, derived from lessons and enrollments. */
export function tasks(ws: Workspace, now = new Date(), t: T = RO): FeedItem[] {
  const items: FeedItem[] = [];
  const tz = ws.timezone;
  const ms = now.getTime();
  const time = (iso: string) => formatTime(iso, tz, t.locale);
  const date = (iso: string) => formatDate(iso, tz, t.locale);

  const toReview = ws.homework.filter(h => h.status === "submitted");
  if (toReview.length) {
    items.push({ id: "t-hw", kind: "homework", title: t("Teme de verificat"), emphasis: String(toReview.length), body: toReview.length === 1 ? t("temă: {title}", { title: toReview[0].title }) : t("teme predate așteaptă nota"), href: "/homework?status=submitted" });
  }

  const unmarked = ws.lessons.filter(l => l.status === "scheduled" && new Date(l.ends_at).getTime() < ms);
  if (unmarked.length) {
    const l = unmarked[unmarked.length - 1];
    items.push({
      id: "t-unmarked", kind: "admin", title: unmarked.length > 1 ? t("Lecții de închis") : l.title,
      emphasis: String(unmarked.length), body: unmarked.length > 1 ? t("lecții încheiate fără status") : t("marchează lecția ca finalizată"),
      href: "/calendar"
    });
  }

  const upcoming = ws.lessons.filter(l => l.status === "scheduled" && new Date(l.starts_at).getTime() > ms && new Date(l.starts_at).getTime() - ms < 2 * DAY);
  const nextFew = upcoming.slice(0, 2);
  for (const l of nextFew) {
    const course = ws.courses.find(c => c.id === l.course_id);
    items.push({
      id: `t-prep-${l.id}`, kind: "prepare", title: l.title, emphasis: time(l.starts_at),
      body: t("pregătește lecția · {date}", { date: date(l.starts_at) }), href: "/calendar", subject: subjectKind(course?.subject ?? null, l.title)
    });
  }

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const dueSoon = ws.payments.filter(p => p.status === "pending" && p.due_date && p.due_date <= new Date(ms + 3 * DAY).toISOString().slice(0, 10));
  if (dueSoon.length) {
    items.push({ id: "t-pay", kind: "payment", title: t("Plăți de încasat"), emphasis: String(dueSoon.length), body: dueSoon.some(p => p.due_date! < todayKey) ? t("include plăți restante") : t("cu termen în următoarele 3 zile"), href: "/payments?status=pending" });
  }

  const enrolledIds = new Set(ws.enrollments.filter(e => e.status === "active").map(e => e.student_id));
  const loose = ws.students.filter(s => s.status === "active" && !enrolledIds.has(s.id));
  if (loose.length) {
    items.push({
      id: "t-loose", kind: "student", title: loose.length > 1 ? t("{name} și alții", { name: loose[0].full_name }) : loose[0].full_name,
      emphasis: String(loose.length), body: loose.length > 1 ? t("elevi fără curs · înscrie-i într-o grupă") : t("elev fără curs · înscrie-l într-o grupă"),
      href: "/students"
    });
  }
  return items.slice(0, 4);
}

export function currencyTotals(entries: Array<{ amount: number; currency: string }>) {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.currency, (map.get(e.currency) ?? 0) + e.amount);
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount }));
}
