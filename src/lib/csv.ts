/**
 * Spreadsheet-friendly CSV: UTF-8 BOM + semicolon separator, which is what
 * Excel expects in ro-RO locales (comma is the decimal separator there).
 */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    // Neutralise formula injection when the file is opened in a spreadsheet.
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map(r => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}

/** yyyy-mm-dd hh:mm in the teacher's timezone. */
export function csvDateTime(iso: string | null, tz: string) {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
