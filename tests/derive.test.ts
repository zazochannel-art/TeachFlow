import { describe, expect, it } from "vitest";
import { courseCards, currencyTotals, daySlots, notifications, subjectKind, tasks } from "@/lib/data/derive";
import { gettingStartedSteps } from "@/components/GettingStarted";
import { course, emptyWorkspace, lesson, payment, student } from "./fixtures";

const NOW = new Date("2026-11-14T13:00:00Z"); // 15:00 in Chisinau

describe("subjectKind", () => {
  it("recognises subjects from Romanian names", () => {
    expect(subjectKind("Matematică")).toBe("math");
    expect(subjectKind("Engleză")).toBe("language");
    expect(subjectKind(null, "Pian începători")).toBe("music");
  });
});

describe("daySlots", () => {
  it("only includes the teacher's local day, in order", () => {
    const ws = emptyWorkspace({ lessons: [
      lesson("late", "2026-11-14T21:30:00Z", 60), // 23:30 local, still the 14th
      lesson("early", "2026-11-14T07:00:00Z", 60),
      lesson("tomorrow", "2026-11-14T22:30:00Z", 60) // 00:30 on the 15th
    ] });
    expect(daySlots(ws, "2026-11-14", NOW).map(s => s.id)).toEqual(["early", "late"]);
  });
});

describe("courseCards", () => {
  it("counts active enrollments and hides inactive courses", () => {
    const ws = emptyWorkspace({
      courses: [course("c1"), course("c2", { is_active: false })],
      students: [student("s1"), student("s2")],
      enrollments: [
        { id: "e1", course_id: "c1", student_id: "s1", enrolled_at: "2026-11-01T00:00:00Z", status: "active" },
        { id: "e2", course_id: "c1", student_id: "s2", enrolled_at: "2026-11-01T00:00:00Z", status: "paused" }
      ]
    });
    const cards = courseCards(ws);
    expect(cards.map(c => c.id)).toEqual(["c1"]);
    expect(cards[0].studentCount).toBe(1);
    expect(courseCards(ws, true)).toHaveLength(2);
  });
});

describe("notifications and tasks", () => {
  it("highlights the next lesson of today", () => {
    const ws = emptyWorkspace({ lessons: [lesson("l1", "2026-11-14T16:00:00Z", 60, { meeting_url: "https://meet.example.com/x" })] });
    const [first] = notifications(ws, NOW);
    expect(first).toMatchObject({ kind: "lesson", title: "Lecția următoare", href: "/classroom/l1" });
  });
  it("asks to close finished lessons, prepare the next ones and collect overdue payments", () => {
    const ws = emptyWorkspace({
      lessons: [lesson("past", "2026-11-13T10:00:00Z", 60), lesson("soon", "2026-11-15T10:00:00Z", 60)],
      payments: [payment("p1", { due_date: "2026-11-10" })]
    });
    const ids = tasks(ws, NOW).map(t => t.id);
    expect(ids).toContain("t-unmarked");
    expect(ids).toContain("t-prep-soon");
    expect(ids).not.toContain("t-link");
    expect(ids).toContain("t-pay");
  });
  it("sends an expired subscription to the billing page", () => {
    const ws = emptyWorkspace({ subscription: { plan_code: "pro", status: "expired", current_period_end: "2026-11-01T00:00:00Z" } });
    expect(notifications(ws, NOW).find(n => n.id === "n-sub")?.href).toBe("/billing");
  });
  it("warns a week before a paid plan runs out, and when it has run out", () => {
    const sub = (end: string) => emptyWorkspace({ subscription: { plan_code: "pro", status: "active", current_period_end: end } });
    expect(notifications(sub("2026-12-30T00:00:00Z"), NOW).find(n => n.id === "n-sub")).toBeUndefined();
    const soon = notifications(sub("2026-11-17T00:00:00Z"), NOW).find(n => n.id === "n-sub");
    expect(soon?.emphasis).toBe("3 zile");
    const gone = notifications(sub("2026-11-10T00:00:00Z"), NOW).find(n => n.id === "n-sub");
    expect(gone?.emphasis).toBe("Expirat");
    expect(gone?.highlight).toBe(true);
  });
  it("returns nothing for an empty account", () => {
    expect(tasks(emptyWorkspace(), NOW)).toEqual([]);
    expect(notifications(emptyWorkspace(), NOW)).toEqual([]);
  });
});

describe("currencyTotals", () => {
  it("sums per currency", () => {
    expect(currencyTotals([{ amount: 100, currency: "MDL" }, { amount: 50, currency: "EUR" }, { amount: 20, currency: "MDL" }]))
      .toEqual([{ currency: "MDL", amount: 120 }, { currency: "EUR", amount: 50 }]);
  });
});

describe("gettingStartedSteps", () => {
  it("starts with only the profile done for a new teacher", () => {
    const steps = gettingStartedSteps(emptyWorkspace());
    expect(steps.filter(s => s.done).map(s => s.id)).toEqual(["profile"]);
    expect(steps.find(s => !s.done)?.href).toBe("/students?new=1");
  });
  it("no longer asks for an external meeting link (lessons have a built-in video call)", () => {
    const ws = emptyWorkspace({ lessons: [lesson("l9", "2026-11-16T10:00:00Z", 60)] });
    expect(gettingStartedSteps(ws).some(s => s.id === "link")).toBe(false);
  });
});
