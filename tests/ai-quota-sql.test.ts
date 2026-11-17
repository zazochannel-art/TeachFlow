import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AI_DAILY_UNITS, PLANS, aiCost } from "@/lib/plans";
import { consumeAiQuota } from "@/lib/ai/quota";

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

describe("consumeAiQuota", () => {
  const client = (result: { data?: unknown; error?: { code?: string; message: string } | null }) =>
    ({ rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }) }) as unknown as Parameters<typeof consumeAiQuota>[0];

  it("lets the call through while units are left", async () => {
    expect(await consumeAiQuota(client({ data: { allowed: true, used: 3, limit: 10 } }), 1)).toEqual({ ok: true, used: 3, limit: 10 });
    expect(await consumeAiQuota(client({ data: { allowed: true, used: 3, limit: null } }), 1)).toEqual({ ok: true, used: 3, limit: null });
  });

  it("refuses with 429 when the day's units are used up", async () => {
    const r = await consumeAiQuota(client({ data: { allowed: false, used: 10, limit: 10 } }), 1);
    expect(r).toMatchObject({ ok: false, status: 429, code: "quota_exceeded" });
  });

  it("fails closed without the migration or when the check errors", async () => {
    expect(await consumeAiQuota(client({ error: { code: "PGRST202", message: "not found" } }), 1)).toMatchObject({ ok: false, code: "migration_missing" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await consumeAiQuota(client({ error: { code: "XX000", message: "boom" } }), 1)).toMatchObject({ ok: false, code: "quota_error" });
  });
});
