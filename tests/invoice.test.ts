import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInvoicePdf, invoiceFileName, invoiceNumber, toInvoiceData, type InvoiceData } from "@/lib/invoices/pdf";
import { renderInvoiceEmail } from "@/lib/invoices/notify";
import { makeT } from "@/lib/i18n/core";

const data: InvoiceData = {
  id: "7f0c1c1e-1111-4222-8333-944445555666", invoice_no: "TF-2026-0007", invoice_at: "2026-11-10T10:00:00Z", created_at: "2026-11-10T10:00:00Z",
  amount: 1200, currency: "MDL", status: "pending", due_date: "2026-11-20", paid_at: null, method: null, note: "Abonament 8 lecții",
  student_name: "Maria Țurcanu", parent_name: "Elena Țurcanu", course_title: "Engleză B2",
  teacher_name: "Ana Popescu", teacher_email: "ana@example.md", timezone: "Europe/Chisinau",
  invoice_name: "II Popescu Ana", invoice_code: "2003600123456", invoice_address: "str. Ștefan cel Mare 1, Chișinău",
  invoice_bank: "MAIB", invoice_iban: "MD24AG000225100013104168", invoice_note: "Mulțumesc!"
};

describe("invoice PDF", () => {
  it("builds a PDF in every language, with Romanian and Russian letters", async () => {
    for (const lang of ["ro", "ru", "en"] as const) {
      const pdf = await buildInvoicePdf(data, makeT(lang));
      expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(5000);
    }
    const paid = await buildInvoicePdf({ ...data, status: "paid", paid_at: "2026-11-12T09:00:00Z", method: "card", invoice_iban: null }, makeT("ro"));
    expect(paid.length).toBeGreaterThan(5000);
  });

  it("names the file after the number", () => {
    expect(invoiceNumber(data)).toBe("TF-2026-0007");
    expect(invoiceNumber({ ...data, invoice_no: null })).toBe("7F0C1C1E");
    expect(invoiceFileName(data, makeT("ro"))).toBe("Factura-TF-2026-0007.pdf");
    expect(invoiceFileName(data, makeT("ru"))).toBe("Schet-TF-2026-0007.pdf");
  });

  it("reads the database answer", () => {
    expect(toInvoiceData(null)).toBeNull();
    expect(toInvoiceData({ ...data, amount: "1200.00" })?.amount).toBe(1200);
  });

  it("writes the e-mail for a due and a paid invoice", () => {
    const t = makeT("ro");
    const due = renderInvoiceEmail(data, t, { appUrl: "https://app.example", hasAccount: true });
    expect(due.subject).toContain("TF-2026-0007");
    expect(due.html).toContain("https://app.example/parent");
    const paid = renderInvoiceEmail({ ...data, status: "paid" }, t, { appUrl: "", hasAccount: false });
    expect(paid.subject).toContain("achitată");
    expect(paid.html).not.toContain("/parent");
    expect(renderInvoiceEmail({ ...data, student_name: "<b>x</b>" }, t, { appUrl: "", hasAccount: false }).html).not.toContain("<b>x</b>");
  });
});

const sql = readFileSync(new URL("../supabase/migrations/0015_gamification_invoices_public_page.sql", import.meta.url), "utf8");

describe("migration 0015", () => {
  it("keeps invoice numbers fixed once given", () => {
    expect(sql).toMatch(/old\.invoice_no is not null then\s+new\.invoice_no := old\.invoice_no/);
  });
  it("lets visitors only call the two public functions", () => {
    const anon = [...sql.matchAll(/grant execute on function ([\w.]+)\([^)]*\) to anon/g)].map(m => m[1]);
    expect(anon.sort()).toEqual(["public.public_signup", "public.public_teacher_page"]);
    expect(sql).not.toMatch(/grant [a-z, ]+ on public\.\w+ to anon/);
  });
  it("checks who may read an invoice", () => {
    expect(sql).toMatch(/invoice_data[\s\S]*?pay\.teacher_id = me[\s\S]*?s\.user_id = me[\s\S]*?l\.user_id = me/);
  });
  it("uses the same address rule as the app", async () => {
    const { SLUG_RE } = await import("@/lib/slug");
    expect(sql).toContain(`public_slug ~ '${SLUG_RE.source}'`);
  });
});
