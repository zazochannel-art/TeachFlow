import { describe, expect, it } from "vitest";
import { langFromAcceptLanguage, makeT } from "@/lib/i18n/core";
import { authErrorMessage } from "@/lib/auth-errors";

describe("makeT", () => {
  it("translates and falls back to the Romanian key", () => {
    expect(makeT("en")("Elevi")).toBe("Students");
    expect(makeT("ru")("Elevi")).toBe("Ученики");
    expect(makeT("ro")("Elevi")).toBe("Elevi");
    expect(makeT("en")("text fără traducere")).toBe("text fără traducere");
  });

  it("fills variables", () => {
    expect(makeT("en")("astăzi la {time}", { time: "10:00" })).toBe("today at 10:00");
    expect(makeT("ro")("astăzi la {time}", { time: "10:00" })).toBe("astăzi la 10:00");
  });

  it("picks plural forms per language", () => {
    const key = "{n} elev|{n} elevi|{n} de elevi";
    expect([1, 2, 20].map(n => makeT("ro").n(key, n))).toEqual(["1 elev", "2 elevi", "20 de elevi"]);
    expect([1, 3, 5, 21].map(n => makeT("ru").n(key, n))).toEqual(["1 ученик", "3 ученика", "5 учеников", "21 ученик"]);
    expect([1, 2].map(n => makeT("en").n(key, n))).toEqual(["1 student", "2 students"]);
  });

  it("formats with the language locale", () => {
    expect(makeT("ru").locale).toBe("ru-RU");
  });
});

describe("language detection", () => {
  it("reads Accept-Language", () => {
    expect(langFromAcceptLanguage("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(langFromAcceptLanguage("de-DE,en;q=0.5")).toBe("en");
    expect(langFromAcceptLanguage("de-DE")).toBeNull();
    expect(langFromAcceptLanguage(null)).toBeNull();
  });
});

describe("authErrorMessage", () => {
  it("translates Supabase errors", () => {
    expect(authErrorMessage("Invalid login credentials", makeT("en"))).toBe("Wrong email or password.");
  });
});
