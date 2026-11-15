import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Migration 0012 adds the `parent` enum value and uses it in the same script. Postgres refuses a new
// enum value inside the transaction that added it, so the role must only be compared as text there.
const sql = readFileSync(new URL("../supabase/migrations/0012_student_profile_parents.sql", import.meta.url), "utf8");

describe("parent accounts migration", () => {
  it("never casts the literal 'parent' to app_role", () => {
    expect(sql).not.toMatch(/'parent'::public\.app_role/);
    expect(sql).not.toMatch(/role\s*=\s*'parent'\s*(and|or|\))/);
  });
  it("hides the parents' channel from students", () => {
    expect(sql).toMatch(/messages_student_select[\s\S]*?channel = 'student'/);
  });
});
