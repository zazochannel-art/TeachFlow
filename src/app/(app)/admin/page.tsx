import { notFound } from "next/navigation";
import { Avatar, Card, PageHeader, Pill } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loadWorkspace, requireTeacher } from "@/lib/data/workspace";
import { adminCloseRequest, adminSetSubscription } from "@/lib/actions/billing";
import { PLANS, effectivePlan, planOf, type PlanCode } from "@/lib/plans";
import { addDays, dateKey, formatDate } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import type { SubscriptionStatus } from "@/types/database";

const statusNames = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", cancelled: "Anulat", expired: "Expirat" } as const;

interface Row {
  teacher_id: string; full_name: string | null; email: string; created_at: string;
  plan_code: PlanCode | null; status: SubscriptionStatus | null; current_period_end: string | null; active_students: number;
  request_id: string | null; request_plan: PlanCode | null; request_period: "month" | "year" | null; request_note: string | null; request_at: string | null;
}

/** Manual billing desk: confirm payments and set each teacher's plan. Admin role only. */
export default async function AdminPage() {
  const [{ supabase, isAdmin }, ws, t] = await Promise.all([requireTeacher(), loadWorkspace(), getT()]);
  if (!supabase || !isAdmin) notFound();

  const { data, error } = await supabase.rpc("admin_list_teachers");
  const rows = (data as Row[] | null) ?? [];
  const today = dateKey(new Date(), ws.timezone);
  const open = rows.filter(r => r.request_id).length;

  return (
    <div>
      <PageHeader title={t("Administrare abonamente")} subtitle={t("{n} profesori · {open} cereri în așteptare", { n: rows.length, open })} />
      {error && <div className="mb-6 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">{t("Aplică migrarea 0005_manual_billing.sql în Supabase pentru abonamente.")} ({error.message})</div>}

      <div className="space-y-3">
        {rows.map(r => {
          const sub = r.plan_code && r.status ? { plan_code: r.plan_code, status: r.status, current_period_end: r.current_period_end } : null;
          const eff = effectivePlan(sub);
          const over = eff.studentLimit != null && r.active_students > eff.studentLimit;
          const suggestedPlan = r.request_plan ?? r.plan_code ?? "free";
          const suggestedEnd = r.request_period === "year" ? addDays(today, 365) : addDays(today, 31);
          return (
            <Card key={r.teacher_id} className={`p-5 ${r.request_id ? "ring-2 ring-[#f3c46b]" : ""}`}>
              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={r.full_name || r.email} size={40} />
                <div className="min-w-0 flex-1 text-[12px]">
                  <p className="truncate text-[14px] font-extrabold">{r.full_name || "—"}</p>
                  <p className="truncate text-muted">{r.email} · {t("din {date}", { date: formatDate(r.created_at, ws.timezone, t.locale) })}</p>
                </div>
                <div className="text-right text-[12px]">
                  <p className="font-extrabold">{planOf(r.plan_code).name} {r.status && <Pill tone={eff.code === r.plan_code ? "green" : "red"}>{t(statusNames[r.status])}</Pill>}</p>
                  <p className="text-muted">{r.current_period_end ? t("până la {date}", { date: formatDate(r.current_period_end, ws.timezone, t.locale) }) : t("fără termen")}</p>
                </div>
                <div className={`w-24 text-right text-[12px] ${over ? "font-extrabold text-[#c03a3a]" : "text-muted"}`}>
                  {t("{n} elevi activi", { n: r.active_students })}
                </div>
              </div>

              {r.request_id && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-[#fff8e8] px-4 py-3 text-[12px] text-[#7a5410]">
                  <span className="flex-1">
                    <b>{t("Cerere: {plan}", { plan: planOf(r.request_plan).name })} · {r.request_period === "year" ? t("anual") : t("lunar")}</b>
                    {r.request_at && ` · ${formatDate(r.request_at, ws.timezone, t.locale)}`}{r.request_note && ` · „${r.request_note}”`}
                  </span>
                  <form action={adminCloseRequest}><input type="hidden" name="id" value={r.request_id} /><SubmitButton className="tf-btn-ghost px-3 py-1.5 text-[12px]">{t("Respinge cererea")}</SubmitButton></form>
                </div>
              )}

              <details className="mt-3" open={Boolean(r.request_id)}>
                <summary className="cursor-pointer text-[12px] font-bold text-primary">{t("Setează abonamentul")}</summary>
                <div className="mt-3">
                  <ActionForm action={adminSetSubscription} submitLabel={t("Salvează abonamentul")} className="grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="teacher_id" value={r.teacher_id} />
                    <select name="plan_code" defaultValue={suggestedPlan} aria-label={t("Plan")} className="tf-input">
                      {PLANS.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                    <select name="status" defaultValue="active" aria-label={t("Status")} className="tf-input">
                      {(Object.keys(statusNames) as SubscriptionStatus[]).map(s => <option key={s} value={s}>{t(statusNames[s])}</option>)}
                    </select>
                    <input name="paid_until" type="date" defaultValue={suggestedPlan === "free" ? "" : suggestedEnd} aria-label={t("Plătit până la")} className="tf-input" />
                    <p className="self-center text-[11px] text-muted">{t("Lasă data goală pentru fără termen.")}</p>
                  </ActionForm>
                </div>
              </details>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
