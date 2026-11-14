import { describe, expect, it } from "vitest";
import { buildDigest, type DigestInput } from "@/lib/reminders/digest";
import { renderDigestEmail } from "@/lib/reminders/email";
import { makeT } from "@/lib/i18n/core";

// 2026-11-14 07:00 in Chisinau (UTC+2).
const now = new Date("2026-11-14T05:00:00Z");
const base: DigestInput = {
  timezone: "Europe/Chisinau",
  students: [{ id: "s1", full_name: "Ana Lungu" }, { id: "s2", full_name: "Ion <b>Rusu</b>" }],
  lessons: [
    { id: "l1", title: "Engleză B2", starts_at: "2026-11-15T07:00:00Z", ends_at: "2026-11-15T08:00:00Z", status: "scheduled", meeting_url: "https://meet.example/x", student_id: null },
    { id: "l2", title: "Pian", starts_at: "2026-11-15T14:00:00Z", ends_at: "2026-11-15T14:45:00Z", status: "scheduled", meeting_url: null, student_id: "s2" },
    { id: "l3", title: "Azi", starts_at: "2026-11-14T10:00:00Z", ends_at: "2026-11-14T11:00:00Z", status: "scheduled", meeting_url: null, student_id: null },
    { id: "l4", title: "Anulată", starts_at: "2026-11-15T09:00:00Z", ends_at: "2026-11-15T10:00:00Z", status: "cancelled", meeting_url: null, student_id: null },
    // 23:30 local on the 15th is still "tomorrow"; 00:30 local on the 16th is not.
    { id: "l5", title: "Seară", starts_at: "2026-11-15T21:30:00Z", ends_at: "2026-11-15T22:00:00Z", status: "scheduled", meeting_url: "https://x", student_id: null },
    { id: "l6", title: "Poimâine", starts_at: "2026-11-15T22:30:00Z", ends_at: "2026-11-15T23:00:00Z", status: "scheduled", meeting_url: "https://x", student_id: null }
  ],
  homework: [{ id: "h1", title: "Eseu", status: "submitted", student_id: "s1" }, { id: "h2", title: "Fișa 3", status: "assigned", student_id: "s1" }],
  payments: [
    { id: "p1", amount: 1200, currency: "MDL", status: "pending", due_date: "2026-11-10", student_id: "s1" },
    { id: "p2", amount: 800, currency: "MDL", status: "pending", due_date: "2026-11-14", student_id: "s2" },
    { id: "p3", amount: 500, currency: "MDL", status: "paid", due_date: "2026-11-01", student_id: "s2" }
  ]
};

describe("buildDigest", () => {
  it("collects tomorrow's lessons in the teacher's time zone, homework to review and overdue payments", () => {
    const d = buildDigest(base, now, makeT("ro"));
    expect(d.tomorrow.map(l => l.split(" · ")[1])).toEqual(["Engleză B2", "Pian", "Seară"]);
    expect(d.tomorrow[0].startsWith("09:00–10:00")).toBe(true);
    expect(d.tomorrow[1]).not.toContain("link");
    expect(d.review).toEqual(["Eseu · Ana Lungu"]);
    expect(d.overdue).toHaveLength(1);
    expect(d.overdue[0]).toContain("Ana Lungu");
    expect(d.subject).toBe("TeachFlow · 3 lecții mâine · 1 temă de verificat · 1 plată restantă");
    expect(d.hasContent).toBe(true);
  });

  it("has no content on a quiet day", () => {
    const d = buildDigest({ ...base, lessons: [], homework: [], payments: [] }, now, makeT("ro"));
    expect(d.hasContent).toBe(false);
  });

  it("speaks the teacher's language", () => {
    expect(buildDigest(base, now, makeT("en")).subject).toBe("TeachFlow · 3 lessons tomorrow · 1 homework to review · 1 overdue payment");
    expect(buildDigest(base, now, makeT("ru")).subject).toBe("TeachFlow · 3 урока завтра · 1 задание на проверку · 1 просроченная оплата");
  });
});

describe("renderDigestEmail", () => {
  it("escapes user text and links back to the app", () => {
    const t = makeT("ro");
    const mail = renderDigestEmail(buildDigest(base, now, t), t, { name: "Elena", appUrl: "https://app.example" });
    expect(mail.html).toContain("Ion &lt;b&gt;Rusu&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Rusu</b>");
    expect(mail.html).toContain('href="https://app.example/homework?status=submitted"');
    expect(mail.text).toContain("Bună dimineața, Elena!");
  });
});
