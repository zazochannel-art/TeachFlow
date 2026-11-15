import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO_INVOICE_DETAILS, buildDemoWorkspace } from "@/lib/data/demo";
import { buildInvoicePdf, invoiceFileName, toInvoiceData, type InvoiceData } from "@/lib/invoices/pdf";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * The PDF invoice of one payment, for the teacher, the student and the student's parents
 * (invoice_data() checks who may see it, migration 0015). `?download=1` saves instead of opening.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t] = await Promise.all([params, getT()]);
  const page = (msg: string, status: number) => new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TeachFlow</title><body style="font-family:Arial,sans-serif;padding:40px;color:#20234b"><p>${msg}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
  const supabase = await createClient();
  if (supabase ? !/^[0-9a-f-]{36}$/i.test(id) : !/^[a-z0-9-]{1,40}$/i.test(id)) return page(t("Factura nu a fost găsită."), 404);
  let data: InvoiceData | null = null;
  if (!supabase) {
    data = demoInvoice(id);
  } else {
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims?.sub) return Response.redirect(new URL(`/login?next=/invoices/${id}`, request.url), 303);
    const { data: raw, error } = await supabase.rpc("invoice_data", { p_payment_id: id });
    if (error) return page(t("Facturile nu sunt activate încă. Profesorul trebuie să aplice migrarea 0015 în Supabase."), 503);
    data = toInvoiceData(raw);
  }
  if (!data) return page(t("Factura nu a fost găsită."), 404);

  const pdf = await buildInvoicePdf(data, t);
  const name = invoiceFileName(data, t);
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${name}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

/** Demo mode only (no Supabase): an invoice for one of the demo payments. */
function demoInvoice(id: string): InvoiceData | null {
  const ws = buildDemoWorkspace();
  const p = ws.payments.find(x => x.id === id);
  if (!p) return null;
  const s = ws.students.find(x => x.id === p.student_id);
  const c = p.course_id ? ws.courses.find(x => x.id === p.course_id) : undefined;
  return {
    id: p.id, invoice_no: `TF-${new Date(p.created_at).getUTCFullYear()}-${String(ws.payments.indexOf(p) + 1).padStart(4, "0")}`, invoice_at: p.created_at, created_at: p.created_at,
    amount: p.amount, currency: p.currency, status: p.status, due_date: p.due_date, paid_at: p.paid_at, method: p.method, note: p.note,
    student_name: s?.full_name ?? "—", parent_name: s?.parent_name ?? null, course_title: c?.title ?? null,
    teacher_name: ws.profile?.full_name || "Profesor Demo", teacher_email: "profesor@example.md", timezone: ws.timezone,
    ...DEMO_INVOICE_DETAILS
  };
}
