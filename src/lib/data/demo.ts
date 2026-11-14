import { DEFAULT_TZ, addDays, dateKey, zonedToUtc } from "@/lib/time";
import type { Workspace } from "./workspace";
import type { Course, Enrollment, Lesson, Student } from "@/types/database";

// Shown only when Supabase is not configured (see README). The UI labels it as demo data.

const studentNames = [
  "Maria Popescu", "Andrei Rusu", "Elena Munteanu", "Ion Ciobanu", "Ana Lungu",
  "Victor Cebotari", "Daniela Rotaru", "Mihai Sandu", "Cristina Bivol", "Alexandru Țurcan"
];

const demoCourses: Array<Pick<Course, "title" | "subject" | "level" | "format" | "price">> = [
  { title: "Engleză B2", subject: "Engleză", level: "B2", format: "group", price: 250 },
  { title: "Matematică BAC", subject: "Matematică", level: "Clasa XII", format: "group", price: 300 },
  { title: "Engleză A1", subject: "Engleză", level: "A1", format: "group", price: 200 },
  { title: "Pian începători", subject: "Muzică", level: "Începător", format: "individual", price: 350 }
];

export function buildDemoWorkspace(): Workspace {
  const tz = DEFAULT_TZ;
  const now = new Date();
  const today = dateKey(now, tz);
  const iso = (key: string, h: number, m: number) => {
    const [y, mo, d] = key.split("-").map(Number);
    return zonedToUtc(y, mo, d, h, m, tz).toISOString();
  };

  const students: Student[] = studentNames.map((full_name, i) => ({
    id: `demo-s${i}`, full_name, email: null, phone: null, notes: null,
    status: i === 9 ? "inactive" : "active",
    created_at: new Date(now.getTime() - (i < 2 ? i + 1 : 20 + i) * 86400000).toISOString()
  }));

  const courses: Course[] = demoCourses.map((c, i) => ({
    ...c, id: `demo-c${i}`, description: null, currency: "MDL", is_active: true,
    created_at: new Date(now.getTime() - 60 * 86400000).toISOString()
  }));

  const groups = [[0, 1, 2, 3], [4, 5, 6], [7, 0, 1], [2]];
  const enrollments: Enrollment[] = groups.flatMap((ids, ci) => ids.map((si, k) => ({
    id: `demo-e${ci}-${si}`, course_id: `demo-c${ci}`, student_id: `demo-s${si}`,
    enrolled_at: new Date(now.getTime() - (ci === 0 && k === 0 ? 1 : 30) * 86400000).toISOString(),
    status: "active" as const
  })));

  const lessons: Lesson[] = [];
  const add = (key: string, h: number, m: number, dur: number, ci: number, status: Lesson["status"], url = true) => {
    const c = courses[ci];
    lessons.push({
      id: `demo-l${lessons.length}`, course_id: c.id, student_id: c.format === "individual" ? "demo-s2" : null,
      title: c.title, description: null, starts_at: iso(key, h, m), ends_at: iso(key, h, m + dur),
      status, meeting_url: url ? "https://meet.example.com/teachflow-demo" : null
    });
  };

  // Past lessons give the course cards their progress.
  for (let w = 1; w <= 6; w++) {
    add(addDays(today, -7 * w), 10, 0, 60, 0, "completed");
    add(addDays(today, -7 * w + 1), 15, 0, 60, 1, w === 2 ? "no_show" : "completed");
    if (w <= 3) add(addDays(today, -7 * w + 2), 17, 0, 45, 2, "completed");
    add(addDays(today, -7 * w + 3), 12, 0, 45, 3, "completed");
  }
  add(addDays(today, -1), 16, 0, 60, 1, "scheduled"); // ended but not marked → task

  // Today and the coming days. Future weeks count towards course progress.
  for (const off of [0, 1, 2, 3, 4, 7, 8, 9]) {
    const key = addDays(today, off);
    add(key, 8, 0, 45, 2, "scheduled");
    add(key, 9, 5, 45, 0, "scheduled");
    add(key, 10, 30, 60, 1, "scheduled", off !== 1);
    add(key, 12, 0, 45, 3, "scheduled");
    add(key, 14, 0, 60, 0, "scheduled");
    add(key, 16, 0, 45, 2, "scheduled");
    add(key, 18, 0, 60, 1, "scheduled");
  }
  lessons.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    mode: "demo", userId: null, email: null, timezone: tz,
    profile: { full_name: "Profesor Demo", avatar_url: null, preferred_language: "ro", timezone: tz },
    teacherProfile: null,
    subscription: { plan_code: "free", status: "trialing", current_period_end: new Date(now.getTime() + 5 * 86400000).toISOString() },
    students, courses, enrollments, lessons
  };
}
