import { describe, expect, it } from "vitest";
import { effectivePlan, overStudentLimit, planOf } from "@/lib/plans";

const now = new Date("2026-11-14T12:00:00Z");

describe("effectivePlan", () => {
  it("is Free without a subscription", () => {
    expect(effectivePlan(null, now).code).toBe("free");
  });
  it("keeps a paid plan while active and inside the paid period", () => {
    expect(effectivePlan({ plan_code: "pro", status: "active", current_period_end: "2026-12-14T23:59:59Z" }, now).code).toBe("pro");
    expect(effectivePlan({ plan_code: "pro", status: "active", current_period_end: null }, now).code).toBe("pro");
  });
  it("falls back to Free when the period ended or the status is not active", () => {
    expect(effectivePlan({ plan_code: "pro", status: "active", current_period_end: "2026-11-01T00:00:00Z" }, now).code).toBe("free");
    expect(effectivePlan({ plan_code: "pro", status: "past_due", current_period_end: "2026-12-14T00:00:00Z" }, now).code).toBe("free");
  });
});

describe("overStudentLimit", () => {
  it("blocks the next student at the limit, never on unlimited plans", () => {
    expect(overStudentLimit(planOf("free"), 4)).toBe(false);
    expect(overStudentLimit(planOf("free"), 5)).toBe(true);
    expect(overStudentLimit(planOf("premium"), 1000)).toBe(false);
  });
});
