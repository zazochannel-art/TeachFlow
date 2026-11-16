import { describe, expect, it } from "vitest";
import { eachLimit } from "@/lib/concurrency";

describe("eachLimit", () => {
  it("visits every item once with at most `limit` in flight", async () => {
    let inFlight = 0, peak = 0;
    const seen: number[] = [];
    await eachLimit([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5));
      seen.push(n); inFlight--;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
  it("does nothing for an empty list", async () => {
    await expect(eachLimit([], 3, async () => { throw new Error("never"); })).resolves.toBeUndefined();
  });
});
