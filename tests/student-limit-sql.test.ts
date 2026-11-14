import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";

// The database trigger (migration 0009) repeats the plan limits; keep both in sync.
const sql = readFileSync(new URL("../supabase/migrations/0009_student_limit_in_db.sql", import.meta.url), "utf8");

describe("student limit trigger", () => {
  it("uses the same limits as src/lib/plans.ts", () => {
    for (const plan of PLANS) {
      if (plan.code === "free") {
        expect(sql).toMatch(new RegExp(`else ${plan.studentLimit}\\b`));
      } else {
        const expected = plan.studentLimit == null ? "null" : String(plan.studentLimit);
        expect(sql).toMatch(new RegExp(`when '${plan.code}' then ${expected}\\b`));
      }
    }
  });
});
