import { describe, expect, it } from "vitest";
import { PAGE_ROWS, readAll, readByIds } from "@/lib/data/paged";
import { courseLessonTotals, countLessons, lessonWindow, studentLessonTotals, totalLessons } from "@/lib/data/lesson-counts";
import { timeBudget, workSeconds } from "@/lib/cron/budget";
import { lesson } from "./fixtures";

/** A table of `n` rows behind an API that answers at most `cap` rows per request, like Supabase. */
function table(n: number, cap = PAGE_ROWS) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe("readAll", () => {
  it("reads past the 1000-row cap of one request", async () => {
    const { page, calls } = table(2500);
    const { data } = await readAll(page);
    expect(data).toHaveLength(2500);
    expect(new Set(data!.map(r => r.id)).size).toBe(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once when everything fits in one page", async () => {
    const { page, calls } = table(10);
    expect((await readAll(page)).data).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  it("stops at the maximum", async () => {
    const { page, calls } = table(5000);
    const { data } = await readAll(page, 1500);
    expect(data).toHaveLength(1500);
    expect(calls).toEqual([[0, 999], [1000, 1499]]);
  });

  it("asks for the next page after a full one, even when it turns out empty", async () => {
    const { page, calls } = table(1000);
    expect((await readAll(page)).data).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("fails as a whole when a page fails", async () => {
    let n = 0;
    const r = await readAll(async (from, to) => (n++ === 0 ? { data: Array.from({ length: to - from + 1 }, () => ({})), error: null } : { data: null, error: { message: "boom" } }));
    expect(r).toEqual({ data: null, error: { message: "boom" } });
  });
});

describe("readByIds", () => {
  it("splits long id lists into small requests and joins the rows", async () => {
    const ids = Array.from({ length: 401 }, (_, i) => `id${i}`);
    const sizes: number[] = [];
    const r = await readByIds([...ids, "id0"], async chunk => { sizes.push(chunk.length); return { data: chunk.map(id => ({ id })), error: null }; });
    expect(sizes).toEqual([150, 150, 101]);
    expect(r.data).toHaveLength(401);
  });

  it("does not ask without ids", async () => {
    let asked = false;
    expect((await readByIds([], async () => { asked = true; return { data: [], error: null }; })).data).toEqual([]);
    expect(asked).toBe(false);
  });
});

describe("lesson totals", () => {
  const rows = [
    lesson("a", "2026-01-05T10:00:00Z", 60, { course_id: "c1", status: "completed" }),
    lesson("b", "2026-01-12T10:00:00Z", 60, { course_id: "c1", status: "no_show" }),
    lesson("c", "2026-01-19T10:00:00Z", 60, { course_id: "c1", status: "cancelled" }),
    lesson("d", "2026-12-19T10:00:00Z", 60, { course_id: "c1" }),
    lesson("e", "2026-01-06T10:00:00Z", 60, { student_id: "s1", status: "completed" }),
    lesson("f", "2026-01-07T10:00:00Z", 60, { student_id: "s2", status: "completed" }),
    lesson("g", "2026-01-08T10:00:00Z", 60, { course_id: "c1", student_id: "s2", status: "completed" })
  ];
  const counts = countLessons(rows);

  it("counts per course, student and status", () => {
    expect(totalLessons(counts)).toBe(7);
    expect(counts.find(c => c.course_id === "c1" && !c.student_id && c.status === "completed")?.n).toBe(1);
  });

  it("gives a course its lessons without the cancelled ones, and those already held or missed", () => {
    expect(courseLessonTotals(counts, "c1")).toEqual({ total: 4, done: 3 });
  });

  it("gives a student their own lessons plus the group lessons of their active courses", () => {
    const enrollments = [{ course_id: "c1", student_id: "s1", status: "active" as const }];
    expect(studentLessonTotals(counts, "s1", enrollments)).toEqual({ held: 2, missed: 1, total: 4 });
    // Not enrolled: only their own lessons (the 1:1 lesson in course c1 included).
    expect(studentLessonTotals(counts, "s2", enrollments)).toEqual({ held: 2, missed: 0, total: 2 });
  });

  it("puts the window around now", () => {
    const w = lessonWindow(new Date("2026-06-01T00:00:00Z"));
    expect(w.from).toBe("2026-02-01T00:00:00.000Z");
    expect(w.to).toBe("2027-01-27T00:00:00.000Z");
  });
});

describe("cron time budget", () => {
  it("is spent after its seconds and keeps a margin from maxDuration", () => {
    let now = 0;
    const b = timeBudget(10, () => now);
    expect(b.spent()).toBe(false);
    now = 9_999;
    expect(b.spent()).toBe(false);
    now = 10_000;
    expect(b.spent()).toBe(true);
    expect(workSeconds(300)).toBe(260);
    expect(workSeconds(30)).toBe(10);
  });
});
