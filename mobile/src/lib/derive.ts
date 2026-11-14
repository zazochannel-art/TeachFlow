import { addDays, dateKey, dayRange, startOfWeek } from "./time";
import type { Lesson, Message, Student } from "./types";

export function lessonsOnDay(lessons: Lesson[], key: string, tz: string) {
  const { start, end } = dayRange(key, tz);
  return lessons.filter(l => { const t = new Date(l.starts_at).getTime(); return t >= start.getTime() && t < end.getTime(); });
}

export function lessonsThisWeek(lessons: Lesson[], tz: string) {
  const monday = startOfWeek(dateKey(new Date(), tz));
  const start = dayRange(monday, tz).start.getTime();
  const end = dayRange(addDays(monday, 7), tz).start.getTime();
  return lessons.filter(l => { const t = new Date(l.starts_at).getTime(); return t >= start && t < end && l.status !== "cancelled"; });
}

export function upcoming(lessons: Lesson[], limit = 5) {
  const now = Date.now();
  return lessons.filter(l => new Date(l.ends_at).getTime() > now && l.status === "scheduled").slice(0, limit);
}

export function studentMap(students: Student[]) {
  return Object.fromEntries(students.map(s => [s.id, s]));
}

export interface Conversation { studentId: string; last: Message | null; unread: number }

export function conversations(students: Student[], messages: Message[]): Conversation[] {
  const byStudent = new Map<string, Message[]>();
  for (const m of messages) {
    const list = byStudent.get(m.student_id) ?? [];
    list.push(m);
    byStudent.set(m.student_id, list);
  }
  return students
    .map(s => {
      const list = byStudent.get(s.id) ?? [];
      return { studentId: s.id, last: list[list.length - 1] ?? null, unread: list.filter(m => m.direction === "incoming" && !m.read_at).length };
    })
    .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}
