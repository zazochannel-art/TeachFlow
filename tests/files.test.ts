import { describe, expect, it } from "vitest";
import { isImage, parseFileRefs, storageName } from "@/lib/files";
import { sanitizeStroke } from "@/lib/board/model";

describe("storageName", () => {
  it("keeps the extension and strips accents and spaces", () => {
    expect(storageName("Temă pagina 42.PDF", "3f9c1a2b-aaaa")).toBe("3f9c1a2b-tema-pagina-42.pdf");
  });
  it("falls back when the name has no letters", () => {
    expect(storageName("???.png", "12345678")).toBe("12345678-fisier.png");
  });
});

describe("parseFileRefs", () => {
  const prefix = "sub/u1/h1/";
  it("keeps only files under the prefix", () => {
    const raw = JSON.stringify([
      { path: "sub/u1/h1/a.pdf", name: "a.pdf", size: 10, type: "application/pdf" },
      { path: "sub/u2/h1/b.pdf", name: "b.pdf" },
      { path: "sub/u1/h1/../../x", name: "x" }
    ]);
    expect(parseFileRefs(raw, prefix).map(f => f.path)).toEqual(["sub/u1/h1/a.pdf"]);
  });
  it("survives bad JSON and duplicates", () => {
    expect(parseFileRefs("{nope", prefix)).toEqual([]);
    const dup = [{ path: "sub/u1/h1/a" }, { path: "sub/u1/h1/a" }];
    expect(parseFileRefs(dup, prefix)).toHaveLength(1);
  });
  it("caps the list at 10 files", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ path: `${prefix}${i}` }));
    expect(parseFileRefs(many, prefix)).toHaveLength(10);
  });
});

describe("image strokes", () => {
  const base = { id: "i1", tool: "image", color: "#000000", size: 1, points: [0, 0, 100, 80] };
  it("accepts lesson files and blob URLs", () => {
    expect(sanitizeStroke({ ...base, src: "lesson/3f9c1a2b-0000-4000-8000-000000000000/3f9c1a2b-poza.png" })).not.toBeNull();
    expect(sanitizeStroke({ ...base, src: "blob:http://localhost/abc" })).not.toBeNull();
  });
  it("rejects other sources", () => {
    expect(sanitizeStroke({ ...base, src: "https://evil.example/x.png" })).toBeNull();
    expect(sanitizeStroke({ ...base, src: "hw/someone/x.png" })).toBeNull();
    expect(sanitizeStroke(base)).toBeNull();
  });
  it("detects images by type or extension", () => {
    expect(isImage({ type: "image/png" })).toBe(true);
    expect(isImage({ name: "x.JPG" })).toBe(true);
    expect(isImage({ name: "x.pdf" })).toBe(false);
  });
});
