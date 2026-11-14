import { loadWorkspace } from "@/lib/data/workspace";
import { csvDateTime, csvResponse, toCsv } from "@/lib/csv";
import { dateKey } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

const methods = { cash: "Numerar", card: "Card", transfer: "Transfer", other: "Altă metodă" } as const;

/** Downloads the teacher's payments (RLS-scoped) as CSV. `?status=` mirrors the page tabs. */
export async function GET(request: Request) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const status = new URL(request.url).searchParams.get("status");
  const today = dateKey(new Date(), ws.timezone);
  const late = (p: (typeof ws.payments)[number]) => p.status === "pending" && !!p.due_date && p.due_date < today;
  const list = ws.payments.filter(p =>
    status === "paid" ? p.status === "paid" : status === "pending" ? p.status === "pending" : status === "overdue" ? late(p) : true);

  const student = new Map(ws.students.map(s => [s.id, s.full_name]));
  const course = new Map(ws.courses.map(c => [c.id, c.title]));
  const body = toCsv(
    ["Elev", "Curs", "Sumă", "Monedă", "Stare", "Termen", "Încasat la", "Metodă", "Notă", "Creat la"].map(h => t(h)),
    list.map(p => [
      student.get(p.student_id) ?? t("Elev șters"),
      p.course_id ? course.get(p.course_id) ?? "" : "",
      p.amount,
      p.currency,
      p.status === "paid" ? t("Încasată") : late(p) ? t("Restantă") : t("De încasat"),
      p.due_date ?? "",
      csvDateTime(p.paid_at, ws.timezone),
      p.method ? t(methods[p.method]) : "",
      p.note ?? "",
      csvDateTime(p.created_at, ws.timezone)
    ])
  );
  return csvResponse(`teachflow-plati-${today}.csv`, body);
}
