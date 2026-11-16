import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPath, isControlFlow, reportError } from "@/lib/monitoring";
import { EXPORT_TABLES } from "@/lib/account";
import { privacy, terms } from "@/lib/i18n/legal";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("monitoring", () => {
  it("ignores redirects and notFound", () => {
    expect(isControlFlow({ digest: "NEXT_REDIRECT;replace;/login;307;" })).toBe(true);
    expect(isControlFlow({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })).toBe(true);
    expect(isControlFlow(new Error("boom"))).toBe(false);
  });
  it("drops query strings from paths", () => {
    expect(cleanPath("/invite/abc?token=secret")).toBe("/invite/abc");
  });
  it("posts to the webhook once per error and never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example/x");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await reportError({ source: "server", message: "unique failure 1", path: "/a?b=c" });
    await reportError({ source: "server", message: "unique failure 1", path: "/a" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).not.toContain("b=c");
  });
});

describe("account data", () => {
  it("exports the main tables", () => {
    for (const t of ["students", "lessons", "payments", "messages", "homework"]) expect(EXPORT_TABLES).toContain(t);
  });
  it("has the legal pages in every language with the same sections", () => {
    for (const doc of [privacy, terms]) {
      expect(doc.ru.sections.length).toBe(doc.ro.sections.length);
      expect(doc.en.sections.length).toBe(doc.ro.sections.length);
      expect(JSON.stringify(doc.ro)).toContain("{contact}");
    }
  });
});
