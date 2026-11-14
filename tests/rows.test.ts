import { describe, expect, it } from "vitest";
import { oldestFirst } from "@/lib/data/rows";

describe("oldestFirst", () => {
  it("reverses rows loaded newest first without touching the input", () => {
    const rows = [3, 2, 1];
    expect(oldestFirst(rows)).toEqual([1, 2, 3]);
    expect(rows).toEqual([3, 2, 1]);
  });
  it("handles a failed query", () => {
    expect(oldestFirst(null)).toEqual([]);
  });
});
