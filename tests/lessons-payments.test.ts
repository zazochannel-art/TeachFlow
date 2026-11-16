import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/migrations/0017_cancelled_payments_lesson_series.sql", import.meta.url), "utf8");

describe("migration 0017", () => {
  it("turns the delete of an invoiced payment into a cancellation", () => {
    expect(sql).toMatch(/add value if not exists 'cancelled'/);
    expect(sql).toMatch(/before delete on public\.payments/);
    expect(sql).toMatch(/old\.invoice_no is null or pg_trigger_depth\(\) > 1/);
    expect(sql).toMatch(/revoke all on function private\.cancel_instead_of_delete\(\)/);
  });
  it("adds the lesson series column idempotently", () => {
    expect(sql).toMatch(/add column if not exists series_id uuid/);
    expect(sql).toMatch(/create index if not exists lessons_series_idx/);
  });
});
