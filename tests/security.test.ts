import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { UPLOAD_TYPES, uploadContentType } from "@/lib/files";
import { dbError } from "@/lib/actions/common";
import { safeNext } from "@/lib/auth-errors";
import { hasCronSecret } from "@/lib/cron/auth";

const sql = readFileSync(new URL("../supabase/migrations/0016_security_hardening.sql", import.meta.url), "utf8");

describe("security migration 0016", () => {
  it("removes the student's direct read of the students row (teacher notes)", () => {
    expect(sql).toMatch(/drop policy if exists students_self_select on public\.students/);
    const fn = sql.slice(sql.indexOf("function public.my_student_records"), sql.indexOf("$$;", sql.indexOf("function public.my_student_records")));
    expect(fn).not.toMatch(/notes|parent_/);
  });
  it("requires the teacher role on every teacher write policy", () => {
    const policies = [...sql.matchAll(/alter policy (\w+) on/g)].map(m => m[1]);
    expect(policies.length).toBe(13);
    for (const name of policies) {
      const block = sql.slice(sql.indexOf(`alter policy ${name} on`)).split(";")[0];
      expect(block, name).toMatch(/private\.is_teacher\(\)/);
    }
  });
  it("keeps the bucket list and the app's upload list identical", () => {
    const list = sql.slice(sql.indexOf("allowed_mime_types = array["), sql.indexOf("]", sql.indexOf("allowed_mime_types = array[")));
    const inSql = new Set([...list.matchAll(/'([^']+)'/g)].map(m => m[1]));
    expect(new Set([...UPLOAD_TYPES, "application/octet-stream"])).toEqual(inSql);
  });
});

describe("uploadContentType", () => {
  it("keeps allowed types and turns anything that a browser could run into a download", () => {
    expect(uploadContentType("application/pdf")).toBe("application/pdf");
    expect(uploadContentType("IMAGE/PNG")).toBe("image/png");
    expect(uploadContentType("text/plain;charset=UTF-8")).toBe("text/plain");
    expect(uploadContentType("text/html")).toBe("application/octet-stream");
    expect(uploadContentType("image/svg+xml")).toBe("application/octet-stream");
    expect(uploadContentType("")).toBe("application/octet-stream");
    expect(uploadContentType(undefined)).toBe("application/octet-stream");
  });
});

describe("dbError", () => {
  it("never shows the raw database text", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(dbError({ code: "XX000", message: "internal: relation \"x\" does not exist" })).toBe("Nu am putut salva. Încearcă din nou.");
    expect(dbError({ code: "23505", message: "duplicate key value" })).toBe("Există deja o înregistrare la fel.");
    expect(dbError({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/Nu ai acces/);
    expect(dbError({ code: "P0001", message: "student_limit_reached" })).toMatch(/limita de elevi/);
    expect(dbError(null, "Altceva.")).toBe("Altceva.");
  });
});

describe("safeNext", () => {
  it("rejects links to other sites", () => {
    expect(safeNext("//evil.example", "/calendar")).toBe("/calendar");
    expect(safeNext("/\\evil.example", "/calendar")).toBe("/calendar");
    expect(safeNext("https://evil.example", "")).toBe("");
    expect(safeNext("/students?edit=1", "/calendar")).toBe("/students?edit=1");
  });
});

describe("hasCronSecret", () => {
  it("accepts only the exact bearer header", () => {
    expect(hasCronSecret("Bearer s3cret", "s3cret")).toBe(true);
    expect(hasCronSecret("Bearer s3cre", "s3cret")).toBe(false);
    expect(hasCronSecret("s3cret", "s3cret")).toBe(false);
    expect(hasCronSecret(null, "s3cret")).toBe(false);
  });
});
