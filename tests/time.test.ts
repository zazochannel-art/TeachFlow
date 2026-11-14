import { describe, expect, it } from "vitest";
import { addDays, dateKey, dayRange, isDateKey, startOfWeek, zonedToUtc } from "@/lib/time";

const TZ = "Europe/Chisinau";

describe("zonedToUtc", () => {
  it("converts winter time (UTC+2)", () => {
    expect(zonedToUtc(2026, 11, 14, 18, 0, TZ).toISOString()).toBe("2026-11-14T16:00:00.000Z");
  });
  it("converts summer time (UTC+3)", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 30, TZ).toISOString()).toBe("2026-07-01T06:30:00.000Z");
  });
  it("handles the day DST ends", () => {
    // 2026-10-25: clocks go back from 04:00 to 03:00 in Chisinau.
    expect(zonedToUtc(2026, 10, 25, 12, 0, TZ).toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });
});

describe("dateKey / dayRange", () => {
  it("uses the teacher's calendar day, not UTC", () => {
    expect(dateKey(new Date("2026-11-14T23:30:00Z"), TZ)).toBe("2026-11-15");
  });
  it("returns local midnight boundaries", () => {
    const { start, end } = dayRange("2026-11-14", TZ);
    expect(start.toISOString()).toBe("2026-11-13T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-14T22:00:00.000Z");
  });
  it("spans 25 hours on the DST-end day", () => {
    const { start, end } = dayRange("2026-10-25", TZ);
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);
  });
});

describe("calendar helpers", () => {
  it("adds days across month ends", () => expect(addDays("2026-11-30", 1)).toBe("2026-12-01"));
  it("finds Monday of the week", () => {
    expect(startOfWeek("2026-11-14")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
  });
  it("validates date keys", () => {
    expect(isDateKey("2026-11-14")).toBe(true);
    expect(isDateKey("2026-13-40")).toBe(false);
    expect(isDateKey("14.11.2026")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});
