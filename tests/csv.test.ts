import { describe, expect, it } from "vitest";
import { csvDateTime, toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("starts with a BOM and uses semicolons and CRLF", () => {
    const out = toCsv(["A", "B"], [["x", 1.5]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.slice(1)).toBe("A;B\r\nx;1,5\r\n");
  });
  it("quotes cells with separators, quotes or newlines", () => {
    expect(toCsv(["n"], [['a;b "c"\nd']]).slice(1)).toBe('n\r\n"a;b ""c""\nd"\r\n');
  });
  it("neutralises formula injection in text but not in numbers", () => {
    expect(toCsv(["n"], [["=HYPERLINK(1)"], ["+40"], ["@x"]]).slice(1)).toBe("n\r\n'=HYPERLINK(1)\r\n'+40\r\n'@x\r\n");
    expect(toCsv(["n"], [[-5]]).slice(1)).toBe("n\r\n-5\r\n");
  });
  it("leaves empty values blank", () => {
    expect(toCsv(["a", "b"], [[null, undefined]]).slice(1)).toBe("a;b\r\n;\r\n");
  });
});

describe("csvDateTime", () => {
  it("formats in the teacher's timezone", () => {
    expect(csvDateTime("2026-11-14T16:05:00Z", "Europe/Chisinau")).toBe("2026-11-14 18:05");
    expect(csvDateTime(null, "Europe/Chisinau")).toBe("");
  });
});
