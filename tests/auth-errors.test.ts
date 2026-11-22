import { describe, expect, it } from "vitest";
import { authErrorFromUrl, authErrorMessage, safeNext } from "@/lib/auth-errors";

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

describe("authErrorFromUrl", () => {
  it("shows known errors from the auth links", () => {
    expect(authErrorFromUrl("Email link is invalid or has expired")).toMatch(/expirat/);
    expect(authErrorFromUrl("no_teacher_role")).toMatch(/profesor/);
    expect(authErrorFromUrl("Link invalid.")).toBe("Link invalid.");
    expect(authErrorFromUrl("Session missing")).toMatch(/Sesiunea/);
  });
  it("never shows text a link makes up", () => {
    expect(authErrorFromUrl("Contul tău a fost blocat. Sună la +373 600 00 000")).toBe("A apărut o eroare. Încearcă din nou.");
    expect(authErrorFromUrl(undefined)).toBe("");
  });
});
