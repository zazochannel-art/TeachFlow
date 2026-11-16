import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatMoney } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

/** What invoice_data() returns (migration 0015). */
export interface InvoiceData {
  id: string;
  invoice_no: string | null;
  invoice_at: string | null;
  created_at: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "cancelled";
  due_date: string | null;
  paid_at: string | null;
  method: "cash" | "card" | "transfer" | "other" | null;
  note: string | null;
  student_name: string;
  parent_name: string | null;
  course_title: string | null;
  teacher_name: string;
  teacher_email: string | null;
  timezone: string;
  invoice_name: string | null;
  invoice_code: string | null;
  invoice_address: string | null;
  invoice_bank: string | null;
  invoice_iban: string | null;
  invoice_note: string | null;
}

export const METHODS = { cash: "Numerar", card: "Card", transfer: "Transfer", other: "Altă metodă" } as const;

export function toInvoiceData(raw: unknown): InvoiceData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return { ...(r as unknown as InvoiceData), amount: Number(r.amount) };
}

/** Invoice number shown to people: the stored one, or a fallback from the payment id. */
export const invoiceNumber = (d: Pick<InvoiceData, "invoice_no" | "id">) => d.invoice_no ?? d.id.slice(0, 8).toUpperCase();

/** File name for downloads and e-mail attachments, e.g. "Factura-TF-2026-0007.pdf". */
export const invoiceFileName = (d: Pick<InvoiceData, "invoice_no" | "id">, t: T) =>
  `${{ ro: "Factura", ru: "Schet", en: "Invoice" }[t.lang]}-${invoiceNumber(d).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;

/** Day the invoice is dated: when it was paid, otherwise when it was issued. */
export function invoiceDate(d: InvoiceData) {
  return d.paid_at ?? d.invoice_at ?? d.created_at;
}

let fontCache: Promise<{ regular: Uint8Array; bold: Uint8Array } | null> | null = null;
/** Liberation Sans (SIL OFL) covers Romanian and Russian letters. Null if the files are missing. */
function loadFonts() {
  fontCache ??= (async () => {
    const dirs = [join(process.cwd(), "src/lib/invoices/fonts"), join(process.cwd(), ".next/server/fonts")];
    for (const dir of dirs) {
      try {
        const [regular, bold] = await Promise.all([readFile(join(dir, "LiberationSans-Regular.ttf")), readFile(join(dir, "LiberationSans-Bold.ttf"))]);
        return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
      } catch { /* try the next place */ }
    }
    console.error("invoice fonts not found; falling back to Helvetica without diacritics");
    return null;
  })();
  return fontCache;
}

/** Without the embedded font only Latin-1 can be drawn: drop diacritics, keep the rest readable. */
const latin = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

const NAVY = rgb(0.067, 0.063, 0.31);
const PRIMARY = rgb(0.32, 0.41, 0.91);
const MUTED = rgb(0.52, 0.55, 0.66);
const INK = rgb(0.13, 0.14, 0.29);
const LINE = rgb(0.9, 0.91, 0.95);
const GREEN = rgb(0.07, 0.55, 0.35);
const AMBER = rgb(0.64, 0.4, 0.04);

/** Builds the invoice PDF (A4) in the language of `t`. */
export async function buildInvoicePdf(d: InvoiceData, t: T): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const files = await loadFonts();
  const font = files ? await doc.embedFont(files.regular, { subset: true }) : await doc.embedFont(StandardFonts.Helvetica);
  const bold = files ? await doc.embedFont(files.bold, { subset: true }) : await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = files ? (s: string) => s : latin;
  const no = invoiceNumber(d);
  doc.setTitle(`${t("Factură")} ${no}`);
  doc.setAuthor(d.invoice_name || d.teacher_name || "TeachFlow");
  doc.setCreator("TeachFlow");
  doc.setProducer("TeachFlow");

  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const M = 48;
  const tz = d.timezone || "Europe/Chisinau";
  // Invoices always show the full date, with the year.
  const fullDate = (iso: string, zone: string) => new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "long", year: "numeric", timeZone: zone }).format(new Date(iso));
  const date = (iso: string) => fullDate(iso, tz);
  const day = (key: string) => fullDate(`${key}T12:00:00Z`, "UTC");
  const money = (n: number) => formatMoney(n, d.currency, t.locale).replace(/ | /g, " ");

  const text = (s: string, x: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(clean(s), { x, y, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? INK });
  const right = (s: string, xRight: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.f ?? font;
    const size = o.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(clean(s), size), y, o);
  };

  // Header band.
  page.drawRectangle({ x: 0, y: 841.89 - 120, width: W, height: 120, color: NAVY });
  text(t("FACTURĂ"), M, 841.89 - 62, { size: 26, f: bold, color: rgb(1, 1, 1) });
  text(t("Nr. {no}", { no }), M, 841.89 - 86, { size: 12, color: rgb(0.85, 0.87, 1) });
  right(t("Data: {date}", { date: date(invoiceDate(d)) }), W - M, 841.89 - 62, { size: 11, color: rgb(1, 1, 1) });
  const paid = d.status === "paid";
  const cancelled = d.status === "cancelled";
  const badge = cancelled ? t("ANULATĂ") : paid ? t("ACHITATĂ") : t("DE ACHITAT");
  const bw = bold.widthOfTextAtSize(clean(badge), 10) + 20;
  page.drawRectangle({ x: W - M - bw, y: 841.89 - 94, width: bw, height: 20, color: cancelled ? rgb(0.75, 0.23, 0.23) : paid ? GREEN : rgb(0.95, 0.65, 0.2) });
  text(badge, W - M - bw + 10, 841.89 - 88, { size: 10, f: bold, color: rgb(1, 1, 1) });

  // Supplier and client.
  let y = 841.89 - 160;
  const col2 = W / 2 + 10;
  text(t("FURNIZOR"), M, y, { size: 9, f: bold, color: MUTED });
  text(t("CLIENT"), col2, y, { size: 9, f: bold, color: MUTED });
  y -= 18;
  const supplier = [
    d.invoice_code ? t("Cod fiscal (IDNO/IDNP): {code}", { code: d.invoice_code }) : null,
    d.invoice_address,
    d.invoice_bank ? t("Banca: {bank}", { bank: d.invoice_bank }) : null,
    d.invoice_iban ? `IBAN: ${d.invoice_iban}` : null,
    d.teacher_email
  ].filter(Boolean) as string[];
  const client = [
    d.parent_name ? t("Elev: {name}", { name: d.student_name }) : null
  ].filter(Boolean) as string[];
  text(fit(clean(d.invoice_name || d.teacher_name || t("Profesor")), bold, 12, col2 - M - 20), M, y, { size: 12, f: bold });
  text(fit(clean(d.parent_name || d.student_name), bold, 12, W - M - col2), col2, y, { size: 12, f: bold });
  let ys = y - 16;
  for (const line of supplier) for (const l of wrap(clean(line), font, 10, col2 - M - 20)) { text(l, M, ys, { color: MUTED }); ys -= 14; }
  let yc = y - 16;
  for (const line of client) for (const l of wrap(clean(line), font, 10, W - M - col2)) { text(l, col2, yc, { color: MUTED }); yc -= 14; }
  y = Math.min(ys, yc) - 22;

  // Items table: one line (the payment), description and amount.
  const sumRight = W - M - 12;
  page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 26, color: rgb(0.945, 0.95, 1) });
  text(t("Descriere"), M + 12, y, { size: 9, f: bold, color: MUTED });
  right(t("Sumă"), sumRight, y, { size: 9, f: bold, color: MUTED });
  y -= 32;
  const descWidth = W - 2 * M - 180;
  const title = d.course_title ? t("Lecții · {course}", { course: d.course_title }) : t("Servicii educaționale");
  const descLines = wrap(clean(title), bold, 11, descWidth);
  descLines.forEach((l, i) => text(l, M + 12, y - i * 14, { size: 11, f: bold }));
  right(money(d.amount), sumRight, y, { size: 11, f: bold });
  y -= descLines.length * 14;
  if (d.note) for (const l of wrap(clean(d.note), font, 10, descWidth).slice(0, 4)) { text(l, M + 12, y, { color: MUTED }); y -= 13; }
  text(t("Elev: {name}", { name: d.student_name }), M + 12, y, { color: MUTED });
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });

  // Total.
  y -= 32;
  const total = money(d.amount);
  const totalW = bold.widthOfTextAtSize(clean(total), 18);
  right(total, sumRight, y, { size: 18, f: bold, color: PRIMARY });
  right(t("Total de plată"), sumRight - totalW - 14, y + 3, { size: 11, color: MUTED });
  y -= 46;

  // Payment status.
  const status = cancelled
    ? t("Factură anulată. Nu trebuie achitată.")
    : paid
    ? t("Achitată pe {date}", { date: d.paid_at ? date(d.paid_at) : "—" }) + (d.method ? ` · ${t(METHODS[d.method])}` : "")
    : d.due_date ? t("Termen de plată: {date}", { date: day(d.due_date) }) : t("De achitat");
  page.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 36, color: cancelled ? rgb(0.99, 0.925, 0.925) : paid ? rgb(0.906, 0.965, 0.933) : rgb(1, 0.973, 0.91) });
  text(status, M + 14, y, { size: 11, f: bold, color: cancelled ? rgb(0.75, 0.23, 0.23) : paid ? GREEN : AMBER });
  y -= 40;
  if (!paid && !cancelled && d.invoice_iban) {
    for (const l of wrap(clean(t("Plata prin transfer: IBAN {iban}, destinatar {name}. Menționează numărul facturii.", { iban: d.invoice_iban, name: d.invoice_name || d.teacher_name })), font, 10, W - 2 * M)) { text(l, M, y, { color: INK }); y -= 14; }
    y -= 6;
  }
  if (d.invoice_note) for (const l of wrap(clean(d.invoice_note), font, 10, W - 2 * M).slice(0, 5)) { text(l, M, y, { color: MUTED }); y -= 14; }

  footer(page, font, clean(t("Document generat automat în TeachFlow · {no}", { no })), W, M);
  return doc.save();
}

function footer(page: PDFPage, font: PDFFont, s: string, W: number, M: number) {
  page.drawLine({ start: { x: M, y: 56 }, end: { x: W - M, y: 56 }, thickness: 0.5, color: LINE });
  page.drawText(s, { x: M, y: 40, size: 8, font, color: MUTED });
}

/** Cuts a single line to `max` points wide, with an ellipsis. */
function fit(s: string, f: PDFFont, size: number, max: number) {
  if (f.widthOfTextAtSize(s, size) <= max) return s;
  let out = s;
  while (out.length > 1 && f.widthOfTextAtSize(`${out}…`, size) > max) out = out.slice(0, -1);
  return `${out}…`;
}

/** Word-wraps text to `max` points wide. */
export function wrap(s: string, f: PDFFont, size: number, max: number): string[] {
  const lines: string[] = [];
  for (const para of s.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) <= max) { line = next; continue; }
      if (line) lines.push(line);
      line = f.widthOfTextAtSize(word, size) <= max ? word : fit(word, f, size, max);
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}
