import { describe, expect, it } from "vitest";
import { computeProgress, gradeRatio, LEVELS, streaks } from "@/lib/gamification";

const tz = "Europe/Chisinau";
const now = new Date("2026-11-15T15:00:00Z");
const at = (day: string, h = 12) => `${day}T${String(h).padStart(2, "0")}:00:00Z`;
const base = { homework: [], quizzes: [], lessons: [], rewards: [], timezone: tz, now };

describe("gradeRatio", () => {
  it("reads the usual grade formats", () => {
    expect(gradeRatio("10")).toBe(1);
    expect(gradeRatio("9,5")).toBe(0.95);
    expect(gradeRatio("85%")).toBe(0.85);
    expect(gradeRatio("18/20")).toBe(0.9);
    expect(gradeRatio("A")).toBe(1);
    expect(gradeRatio("bine")).toBeNull();
    expect(gradeRatio(null)).toBeNull();
  });
});

describe("streaks", () => {
  it("counts the run ending today or yesterday, and the best run", () => {
    const days = new Set(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-13", "2026-11-14"]);
    expect(streaks(days, "2026-11-15")).toEqual({ current: 2, best: 4 });
    expect(streaks(days, "2026-11-14")).toEqual({ current: 2, best: 4 });
    expect(streaks(days, "2026-11-16").current).toBe(0);
  });
});

describe("computeProgress", () => {
  it("gives points for homework, on-time and top grades", () => {
    const p = computeProgress({
      ...base,
      homework: [
        { status: "reviewed", due_at: at("2026-11-10", 20), submitted_at: at("2026-11-10"), grade: "10" },
        { status: "submitted", due_at: at("2026-11-11", 8), submitted_at: at("2026-11-11", 9), grade: null },
        { status: "assigned", due_at: null, submitted_at: null, grade: null }
      ]
    });
    expect(p.points).toBe(10 + 5 + 5 + 10);
    expect(p.counts).toMatchObject({ homework: 2, onTime: 1, topGrades: 1 });
    expect(p.badges.find(b => b.id === "hw1")?.earned).toBe(true);
    expect(p.badges.find(b => b.id === "hw10")).toMatchObject({ earned: false, value: 2, target: 10 });
  });

  it("scores tests by result, with a bonus for 100%", () => {
    const p = computeProgress({ ...base, quizzes: [
      { status: "submitted", score: 10, max_score: 10, submitted_at: at("2026-11-14") },
      { status: "submitted", score: 5, max_score: 10, submitted_at: at("2026-11-15") },
      { status: "assigned", score: null, max_score: null, submitted_at: null }
    ] });
    expect(p.points).toBe((10 + 10 + 5) + (10 + 5));
    expect(p.badges.find(b => b.id === "perfect")?.earned).toBe(true);
    expect(p.streak).toBe(2);
    expect(p.activeToday).toBe(true);
  });

  it("counts attended lessons, teacher bonuses, and never goes below zero", () => {
    const p = computeProgress({ ...base,
      lessons: [{ status: "completed", starts_at: at("2026-11-12") }, { status: "no_show", starts_at: at("2026-11-13") }, { status: "completed", starts_at: at("2026-11-20") }],
      rewards: [{ points: 20, reason: "activ", created_at: at("2026-11-12") }]
    });
    expect(p.points).toBe(5 + 20);
    expect(computeProgress({ ...base, rewards: [{ points: -50, reason: "x", created_at: at("2026-11-12") }] }).points).toBe(0);
  });

  it("uses the student's time zone for days", () => {
    // 22:30 UTC on the 14th is already the 15th in Chișinău.
    const p = computeProgress({ ...base, homework: [{ status: "submitted", due_at: null, submitted_at: "2026-11-14T22:30:00Z", grade: null }] });
    expect(p.activeToday).toBe(true);
    expect(p.lastDays.at(-1)).toEqual({ day: "2026-11-15", active: true });
  });

  it("moves through the levels", () => {
    const lv = (points: number) => computeProgress({ ...base, rewards: points ? [{ points, reason: "x", created_at: at("2026-11-01") }] : [] });
    expect(lv(0)).toMatchObject({ level: 1, levelFrom: 0, levelTo: LEVELS[1] });
    expect(lv(50).level).toBe(2);
    expect(lv(99).level).toBe(2);
    expect(computeProgress({ ...base, rewards: Array.from({ length: 40 }, () => ({ points: 100, reason: "x", created_at: at("2026-11-01") })) })).toMatchObject({ level: LEVELS.length, levelTo: null });
  });
});
