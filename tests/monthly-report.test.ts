import { describe, expect, it } from "vitest";
import { buildMonthlyReport, monthRange, previousMonth, renderReportEmail } from "@/lib/reports/monthly";
import { makeT } from "@/lib/i18n/core";

const t = makeT("ro");
const base = {
  timezone: "Europe/Chisinau", month: "2026-10", studentName: "Ana Popa", teacherName: "Prof. Ion",
  courses: [], lessons: [], homework: [], quizzes: [], payments: []
};

describe("monthly parent report", () => {
  it("finds the previous month in the teacher's time zone", () => {
    expect(previousMonth(new Date("2026-11-01T05:00:00Z"), "Europe/Chisinau")).toBe("2026-10");
    expect(previousMonth(new Date("2026-01-01T07:00:00Z"), "Europe/Chisinau")).toBe("2025-12");
    const { start, end } = monthRange("2026-10", "Europe/Chisinau");
    expect(start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });
  it("counts the month's lessons, homework and quizzes", () => {
    const r = buildMonthlyReport({
      ...base,
      lessons: [
        { id: "1", title: "Engleză", starts_at: "2026-10-05T12:00:00Z", status: "completed", course_id: null },
        { id: "2", title: "Engleză", starts_at: "2026-10-12T12:00:00Z", status: "no_show", course_id: null },
        { id: "3", title: "Engleză", starts_at: "2026-10-19T12:00:00Z", status: "cancelled", course_id: null },
        { id: "4", title: "Engleză", starts_at: "2026-11-02T12:00:00Z", status: "completed", course_id: null }
      ],
      homework: [{ id: "h", title: "Ex. 3", status: "reviewed", grade: "9", due_at: "2026-10-10T20:00:00Z", submitted_at: "2026-10-09T10:00:00Z", created_at: "2026-10-03T10:00:00Z" }],
      quizzes: [{ id: "q", title: "Test", status: "submitted", score: 3, max_score: 4, submitted_at: "2026-10-20T10:00:00Z" }]
    }, t);
    expect(r.lessons).toMatchObject({ held: 1, missed: 1, cancelled: 1 });
    expect(r.attendance).toBe(50);
    expect(r.homework).toMatchObject({ given: 1, handedIn: 1, onTime: 1, grades: ["Ex. 3: 9"] });
    expect(r.quizzes.average).toBe(75);
    expect(r.hasContent).toBe(true);
    const mail = renderReportEmail(r, t, { studentName: "Ana Popa", teacherName: "Prof. Ion", appUrl: "https://x", hasAccount: true });
    expect(mail.subject).toBe("Ana Popa · raportul lunii octombrie 2026");
    expect(mail.html).toContain("https://x/parent");
  });
  it("has nothing to send for a quiet month", () => {
    expect(buildMonthlyReport(base, t).hasContent).toBe(false);
  });
});
