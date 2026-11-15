import { describe, expect, it } from "vitest";
import { SLUG_RE, suggestSlug } from "@/lib/slug";

describe("public page address", () => {
  it("is made from the teacher's name", () => {
    expect(suggestSlug("Ana Țurcan")).toBe("ana-turcan");
    expect(suggestSlug("  Ion  Ciobanu-Rusu ")).toBe("ion-ciobanu-rusu");
    expect(suggestSlug("Анна Иванова")).toBe("anna-ivanova");
    expect(suggestSlug("")).toBe("profesor");
    expect(suggestSlug("Al")).toBe("profesor-al");
  });
  it("always matches the rule the database checks", () => {
    for (const n of ["Ana Țurcan", "Анна Иванова", "", "x", "A".repeat(80), "---", "Élodie 2"]) {
      const s = suggestSlug(n);
      expect(s).toMatch(SLUG_RE);
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s.length).toBeLessThanOrEqual(40);
    }
  });
});
