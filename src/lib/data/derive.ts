import type { Workspace } from "./workspace";
import type { Course, Lesson } from "@/types/database";
import { dayRange, formatDate, formatTime, initials } from "@/lib/time";

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

export function toSlot(ws: Workspace, l: Lesson, now: Date, nextId: string | null): Slot {
  const start = new Date(l.starts_at).getTime();
  const end = new Date(l.ends_at).getTime();
  const t = now.getTime();
  const course = ws.courses.find(c => c.id === l.course_id);
  let state: Slot["state"] = end <= t ? "past" : start <= t ? "now" : "later";
  if (state === "later" && l.id === nextId) state = "next";
  if (l.status === "cancelled" && state !== "past") state = "later";
  return {
    id: l.id, title: l.title, subtitle: lessonSubtitle(ws, l),
    start: formatTime(l.starts_at, ws.timezone), end: formatTime(l.ends_at, ws.timezone),
    startsAt: l.starts_at, meetingUrl: l.meeting_url, status: l.status, state,
    subject: subjectKind(course?.subject ?? null, l.title)
  };
}

export function lessonsBetween(ws: Workspace, start: Date, end: Date) {
  return ws.lessons.filter(l => {
    const s = new Date(l.starts_at);
    return s >= start && s < end;
  });
}

/** Lessons of one day. The lesson in progress (or, if none, the next one today) is highlighted. */
export function daySlots(ws: Workspace, key: string, now = new Date()): Slot[] {
  const { start, end } = dayRange(key, ws.timezone);
  const lessons = lessonsBetween(ws, start, end);
  const current = currentLesson(ws, now);
  const nextId = current && !lessons.some(l => isNow(l, now)) ? current.id : null;
  return lessons.map(l => toSlot(ws, l, now, nextId));
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
export function notifications(ws: Workspace, now = new Date()): FeedItem[] {
  const items: FeedItem[] = [];
  const tz = ws.timezone;
  const cur = currentLesson(ws, now);
  if (cur) {
    const running = isNow(cur, now);
    items.push({
      id: `n-${cur.id}`, kind: "lesson", highlight: true,
      title: running ? "E timpul lecției!" : "Lecția următoare",
      body: running ? `a început la ${formatTime(cur.starts_at, tz)} · în desfășurare` : `astăzi la ${formatTime(cur.starts_at, tz)}`,
      emphasis: cur.title,
      href: cur.meeting_url ?? "/classroom", external: !!cur.meeting_url
    });
  }

  const recent = ws.lessons
    .filter(l => (l.status === "completed" || l.status === "no_show") && now.getTime() - new Date(l.ends_at).getTime() < 7 * DAY && new Date(l.ends_at) <= now)
    .slice(-2).reverse();
  for (const l of recent) {
    const card = courseCards(ws, true).find(c => c.id === l.course_id);
    items.push({
      id: `n-done-${l.id}`, kind: l.status === "no_show" ? "student" : "homework",
      title: l.title,
      emphasis: l.status === "no_show" ? "Absență" : card?.progress != null ? `${card.progress}%` : "Finalizată",
      body: l.status === "no_show" ? `elevul nu s-a prezentat · ${formatDate(l.starts_at, tz)}` : `din curs parcurs · lecție încheiată ${formatDate(l.starts_at, tz)}`,
      href: "/homework", subject: card?.subject
    });
  }

  const studentName = new Map(ws.students.map(s => [s.id, s.full_name]));
  const courseTitle = new Map(ws.courses.map(c => [c.id, c.title]));
  ws.enrollments
    .filter(e => now.getTime() - new Date(e.enrolled_at).getTime() < 14 * DAY)
    .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at))
    .slice(0, 2)
    .forEach(e => items.push({
      id: `n-enr-${e.id}`, kind: "student",
      title: studentName.get(e.student_id) ?? "Elev nou",
      body: `s-a înscris la ${courseTitle.get(e.course_id) ?? "un curs"}`,
      href: "/students"
    }));

  const sub = ws.subscription;
  if (sub && (sub.status === "past_due" || sub.status === "expired")) {
    items.push({ id: "n-sub", kind: "payment", title: "Abonament", emphasis: sub.status === "past_due" ? "Plată restantă" : "Expirat", body: "actualizează metoda de plată", href: "/payments" });
  } else if (sub?.status === "trialing" && sub.current_period_end) {
    items.push({ id: "n-sub", kind: "payment", title: "Perioada de probă", body: `se încheie pe ${formatDate(sub.current_period_end, tz)}`, href: "/payments" });
  }
  return items.slice(0, 4);
}

/** Things the teacher should do, derived from lessons and enrollments. */
export function tasks(ws: Workspace, now = new Date()): FeedItem[] {
  const items: FeedItem[] = [];
  const tz = ws.timezone;
  const t = now.getTime();

  const unmarked = ws.lessons.filter(l => l.status === "scheduled" && new Date(l.ends_at).getTime() < t);
  if (unmarked.length) {
    const l = unmarked[unmarked.length - 1];
    items.push({
      id: "t-unmarked", kind: "admin", title: unmarked.length > 1 ? "Lecții de închis" : l.title,
      emphasis: String(unmarked.length), body: unmarked.length > 1 ? "lecții încheiate fără status" : "marchează lecția ca finalizată",
      href: "/calendar"
    });
  }

  const upcoming = ws.lessons.filter(l => l.status === "scheduled" && new Date(l.starts_at).getTime() > t && new Date(l.starts_at).getTime() - t < 2 * DAY);
  const noLink = upcoming.filter(l => !l.meeting_url);
  if (noLink.length) {
    items.push({ id: "t-link", kind: "admin", title: noLink[0].title, emphasis: "Link lipsă", body: `pentru ${formatDate(noLink[0].starts_at, tz)}, ${formatTime(noLink[0].starts_at, tz)}`, href: "/classroom" });
  }

  const nextFew = upcoming.filter(l => l.meeting_url).slice(0, 2);
  for (const l of nextFew) {
    const course = ws.courses.find(c => c.id === l.course_id);
    items.push({
      id: `t-prep-${l.id}`, kind: "prepare", title: l.title, emphasis: formatTime(l.starts_at, tz),
      body: `pregătește lecția · ${formatDate(l.starts_at, tz)}`, href: "/calendar", subject: subjectKind(course?.subject ?? null, l.title)
    });
  }

  const enrolledIds = new Set(ws.enrollments.filter(e => e.status === "active").map(e => e.student_id));
  const loose = ws.students.filter(s => s.status === "active" && !enrolledIds.has(s.id));
  if (loose.length) {
    items.push({
      id: "t-loose", kind: "student", title: loose.length > 1 ? `${loose[0].full_name} și alții` : loose[0].full_name,
      emphasis: String(loose.length), body: loose.length > 1 ? "elevi fără curs · înscrie-i într-o grupă" : "elev fără curs · înscrie-l într-o grupă",
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
