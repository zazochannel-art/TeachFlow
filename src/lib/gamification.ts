import { addDays, dateKey } from "@/lib/time";

// Points, levels, badges and day streaks of one student (migration 0015 adds bonus points and the
// teacher's switch). Everything is computed from what already happened, so nothing can be "farmed":
// homework handed in, tests finished, lessons attended and points the teacher gave by hand.

export interface GHomework { status: "assigned" | "submitted" | "reviewed"; due_at: string | null; submitted_at: string | null; grade: string | null; title?: string }
export interface GQuiz { status: "assigned" | "submitted"; score: number | null; max_score: number | null; submitted_at: string | null; title?: string }
export interface GLesson { status: string; starts_at: string; title?: string }
export interface GReward { points: number; reason: string; created_at: string }

export interface ProgressInput { homework: GHomework[]; quizzes: GQuiz[]; lessons: GLesson[]; rewards: GReward[]; timezone: string; now: Date }

export const POINTS = {
  homework: 10,
  onTime: 5,
  topGrade: 5,
  quiz: 10,
  /** Up to this many extra points for the score of a test (proportional). */
  quizScore: 10,
  perfectQuiz: 5,
  lesson: 5
} as const;

/** Points needed to reach each level (index = level - 1). */
export const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000] as const;
export const LEVEL_NAMES = ["Începător", "Explorator", "Ucenic", "Silitor", "Cunoscător", "Avansat", "Expert", "Maestru", "Campion", "Legendă"] as const;

export type BadgeIcon = "book" | "clock" | "flame" | "trophy" | "star" | "target" | "calendar" | "medal" | "rocket";
export interface Badge { id: string; title: string; text: string; icon: BadgeIcon; target: number; value: number; earned: boolean }
export interface PointEvent { at: string; label: string; detail?: string; points: number }

export interface Progress {
  points: number;
  level: number;
  levelName: string;
  /** Points of the current level's start and the next level (null at the top level). */
  levelFrom: number;
  levelTo: number | null;
  streak: number;
  bestStreak: number;
  /** Today already counts in the streak (otherwise it ends today if nothing is done). */
  activeToday: boolean;
  /** Day keys (YYYY-MM-DD, student's time zone) of the last 14 days, with activity or not. */
  lastDays: Array<{ day: string; active: boolean }>;
  badges: Badge[];
  events: PointEvent[];
  counts: { homework: number; onTime: number; topGrades: number; quizzes: number; perfectQuizzes: number; goodQuizzes: number; lessons: number };
}

/** A grade as a fraction of the top mark: 1–10 (Moldovan scale), percentages, "9/10". Null if unknown. */
export function gradeRatio(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const g = grade.trim().replace(",", ".");
  const frac = g.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) { const a = Number(frac[1]), b = Number(frac[2]); return b > 0 ? Math.min(1, a / b) : null; }
  const pct = g.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) return Math.min(1, Number(pct[1]) / 100);
  const num = g.match(/^(\d+(?:\.\d+)?)$/);
  if (num) { const n = Number(num[1]); if (n <= 10) return n / 10; if (n <= 100) return n / 100; return null; }
  const letter = g.toUpperCase();
  const letters: Record<string, number> = { "A+": 1, A: 1, "A-": 0.9, "B+": 0.85, B: 0.8, C: 0.7, D: 0.6, E: 0.5, F: 0.3 };
  return letter in letters ? letters[letter] : null;
}

function levelOf(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1]) i++;
  return { level: i + 1, levelName: LEVEL_NAMES[i], levelFrom: LEVELS[i], levelTo: i + 1 < LEVELS.length ? LEVELS[i + 1] : null };
}

/** Longest run of consecutive days in a set of day keys, and the run ending today/yesterday. */
export function streaks(days: Set<string>, today: string) {
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue;
    let n = 1;
    while (days.has(addDays(d, n))) n++;
    best = Math.max(best, n);
  }
  let start = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(start)) { current++; start = addDays(start, -1); }
  return { current, best };
}

export function computeProgress(input: ProgressInput): Progress {
  const { timezone: tz, now } = input;
  const today = dateKey(now, tz);
  const events: PointEvent[] = [];
  const days = new Set<string>();

  let homework = 0, onTime = 0, topGrades = 0;
  for (const h of input.homework) {
    if (h.status === "assigned" || !h.submitted_at) continue;
    homework++;
    days.add(dateKey(new Date(h.submitted_at), tz));
    const early = !h.due_at || new Date(h.submitted_at) <= new Date(h.due_at);
    let pts = POINTS.homework;
    if (early) { onTime++; pts += POINTS.onTime; }
    const r = h.status === "reviewed" ? gradeRatio(h.grade) : null;
    if (r != null && r >= 0.9) { topGrades++; pts += POINTS.topGrade; }
    events.push({ at: h.submitted_at, label: "Temă predată", detail: h.title, points: pts });
  }

  let quizzes = 0, perfectQuizzes = 0, goodQuizzes = 0;
  for (const q of input.quizzes) {
    if (q.status !== "submitted" || !q.submitted_at) continue;
    quizzes++;
    days.add(dateKey(new Date(q.submitted_at), tz));
    let pts = POINTS.quiz;
    if (q.score != null && q.max_score) {
      const ratio = Math.max(0, Math.min(1, q.score / q.max_score));
      pts += Math.round(ratio * POINTS.quizScore);
      if (ratio >= 0.8) goodQuizzes++;
      if (ratio >= 1) { perfectQuizzes++; pts += POINTS.perfectQuiz; }
    }
    events.push({ at: q.submitted_at, label: "Test rezolvat", detail: q.title, points: pts });
  }

  let lessons = 0;
  for (const l of input.lessons) {
    if (l.status !== "completed" || new Date(l.starts_at) > now) continue;
    lessons++;
    events.push({ at: l.starts_at, label: "Lecție la care ai participat", detail: l.title, points: POINTS.lesson });
  }

  for (const r of input.rewards) events.push({ at: r.created_at, label: r.points > 0 ? "Bonus de la profesor" : "Puncte scăzute de profesor", detail: r.reason, points: r.points });

  const points = Math.max(0, events.reduce((s, e) => s + e.points, 0));
  const { current, best } = streaks(days, today);
  const lastDays = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map(day => ({ day, active: days.has(day) }));

  const badge = (id: string, title: string, text: string, icon: BadgeIcon, value: number, target: number): Badge =>
    ({ id, title, text, icon, value: Math.min(value, target), target, earned: value >= target });
  const badges = [
    badge("hw1", "Prima temă", "Predă prima temă", "book", homework, 1),
    badge("hw10", "Harnic", "Predă 10 teme", "book", homework, 10),
    badge("hw50", "Neobosit", "Predă 50 de teme", "rocket", homework, 50),
    badge("ontime10", "Punctual", "Predă 10 teme la timp", "clock", onTime, 10),
    badge("streak3", "În ritm", "3 zile la rând cu teme sau teste", "flame", best, 3),
    badge("streak7", "O săptămână de foc", "7 zile la rând cu teme sau teste", "flame", best, 7),
    badge("streak30", "Disciplină de fier", "30 de zile la rând cu teme sau teste", "flame", best, 30),
    badge("quiz1", "Primul test", "Rezolvă primul test", "target", quizzes, 1),
    badge("quiz5", "As la teste", "5 teste cu cel puțin 80%", "trophy", goodQuizzes, 5),
    badge("perfect", "Fără greșeală", "Un test rezolvat 100%", "star", perfectQuizzes, 1),
    badge("top5", "Note mari", "5 teme cu nota 9 sau 10", "medal", topGrades, 5),
    badge("lessons10", "Mereu prezent", "Participă la 10 lecții", "calendar", lessons, 10),
    badge("lessons50", "Fidel", "Participă la 50 de lecții", "calendar", lessons, 50)
  ];

  events.sort((a, b) => b.at.localeCompare(a.at));
  return {
    points, ...levelOf(points),
    streak: current, bestStreak: best, activeToday: days.has(today), lastDays,
    badges, events,
    counts: { homework, onTime, topGrades, quizzes, perfectQuizzes, goodQuizzes, lessons }
  };
}
