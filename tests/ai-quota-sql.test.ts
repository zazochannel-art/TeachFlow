import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_DAILY_UNITS, PLANS, aiCost } from "@/lib/plans";

// The database function (migration 0023) repeats the daily AI units; keep both in sync.
const sql = readFileSync(new URL("../supabase/migrations/0023_ai_quota.sql", import.meta.url), "utf8");

describe("AI quota", () => {
  it("uses the same daily units as src/lib/plans.ts", () => {
    for (const plan of PLANS) {
      const units = AI_DAILY_UNITS[plan.code];
      if (plan.code === "free") expect(sql).toMatch(new RegExp(`else ${units}\\b`));
      else expect(sql).toMatch(new RegExp(`when '${plan.code}' then ${units}\\b`));
    }
  });

  it("is enforced in the database, readable only by the owner, with no refund door", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.ai_usage from anon, authenticated/);
    expect(sql).toMatch(/for update/);
    expect(sql).not.toMatch(/function public\.refund_ai_quota/);
  });

  it("costs more for many generated questions, never less than one unit", () => {
    expect(aiCost({ action: "generate", count: 1 })).toBe(1);
    expect(aiCost({ action: "generate", count: 10 })).toBe(1);
    expect(aiCost({ action: "generate", count: 11 })).toBe(2);
    expect(aiCost({ action: "generate", count: 50 })).toBe(5);
    expect(aiCost({ action: "variant", questions: 25 })).toBe(3);
    expect(aiCost({ action: "assist" })).toBe(1);
    expect(aiCost({ action: "grade" })).toBe(1);
  });
});
