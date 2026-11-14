import { DEFAULT_TZ, addDays, dateKey, zonedToUtc } from "@/lib/time";
import type { Workspace } from "./workspace";
import type { Course, Enrollment, Homework, Lesson, Message, Payment, Student } from "@/types/database";

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

  const ago = (days: number, h = 0) => new Date(now.getTime() - days * 86400000 - h * 3600000).toISOString();
  const homework: Homework[] = [
    { id: "demo-h0", student_id: "demo-s0", course_id: "demo-c0", lesson_id: null, title: "Essay: My city", description: "200 de cuvinte", due_at: ago(-2), status: "submitted", submitted_at: ago(0, 3), grade: null, feedback: null, created_at: ago(5) },
    { id: "demo-h1", student_id: "demo-s1", course_id: "demo-c0", lesson_id: null, title: "Essay: My city", description: "200 de cuvinte", due_at: ago(-2), status: "submitted", submitted_at: ago(1), grade: null, feedback: null, created_at: ago(5) },
    { id: "demo-h2", student_id: "demo-s4", course_id: "demo-c1", lesson_id: null, title: "Ecuații de gradul II — fișa 3", description: null, due_at: ago(-4), status: "assigned", submitted_at: null, grade: null, feedback: null, created_at: ago(2) },
    { id: "demo-h3", student_id: "demo-s2", course_id: "demo-c3", lesson_id: null, title: "Gama Do major", description: null, due_at: ago(1), status: "reviewed", submitted_at: ago(2), grade: "9", feedback: "Ritm bun, atenție la degetul 4.", created_at: ago(8) }
  ];
  const messages: Message[] = [
    { id: "demo-m0", student_id: "demo-s0", direction: "incoming", body: "Bună ziua! Am trimis eseul, puteți să-l verificați?", read_at: null, created_at: ago(0, 2) },
    { id: "demo-m1", student_id: "demo-s0", direction: "outgoing", body: "Mulțumesc, Maria! Îl verific până mâine.", read_at: ago(0, 1), created_at: ago(0, 1) },
    { id: "demo-m2", student_id: "demo-s4", direction: "incoming", body: "Putem muta lecția de joi la 17:00?", read_at: null, created_at: ago(0, 5) },
    { id: "demo-m3", student_id: "demo-s2", direction: "outgoing", body: "Exersează gama de 10 minute pe zi.", read_at: ago(3), created_at: ago(3) }
  ];
  const payments: Payment[] = [
    { id: "demo-p0", student_id: "demo-s0", course_id: "demo-c0", amount: 1000, currency: "MDL", status: "paid", due_date: null, paid_at: ago(3), method: "transfer", note: "Abonament 4 lecții", created_at: ago(3) },
    { id: "demo-p1", student_id: "demo-s2", course_id: "demo-c3", amount: 1400, currency: "MDL", status: "paid", due_date: null, paid_at: ago(6), method: "card", note: null, created_at: ago(6) },
    { id: "demo-p2", student_id: "demo-s4", course_id: "demo-c1", amount: 1200, currency: "MDL", status: "pending", due_date: ago(1).slice(0, 10), paid_at: null, method: null, note: null, created_at: ago(10) },
    { id: "demo-p3", student_id: "demo-s7", course_id: "demo-c2", amount: 800, currency: "MDL", status: "pending", due_date: ago(-5).slice(0, 10), paid_at: null, method: null, note: null, created_at: ago(2) }
  ];

  return {
    mode: "demo", userId: null, email: null, isAdmin: false, timezone: tz,
    profile: { full_name: "Profesor Demo", avatar_url: null, preferred_language: "ro", timezone: tz },
    teacherProfile: null,
    subscription: { plan_code: "free", status: "trialing", current_period_end: new Date(now.getTime() + 5 * 86400000).toISOString() },
    students, courses, enrollments, lessons, homework, messages, payments, missingTables: []
  };
}
