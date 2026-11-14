import { describe, expect, it } from "vitest";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";

describe("safeNext", () => {
  it("keeps same-site paths", () => expect(safeNext("/calendar?new=1")).toBe("/calendar?new=1"));
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined])(
    "rejects %s", value => expect(safeNext(value)).toBe("/dashboard"));
});

describe("authErrorMessage", () => {
  it("translates common Supabase errors", () => {
    expect(authErrorMessage("Invalid login credentials")).toBe("Email sau parolă greșită.");
    expect(authErrorMessage("Email not confirmed")).toMatch(/Confirmă/);
    expect(authErrorMessage("Email link is invalid or has expired")).toMatch(/expirat/);
    expect(authErrorMessage("no_teacher_role")).toMatch(/profesor/);
  });
  it("falls back to the original text or a generic message", () => {
    expect(authErrorMessage("Something new")).toBe("Something new");
    expect(authErrorMessage(null)).toMatch(/eroare/);
  });
});
