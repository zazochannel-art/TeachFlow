import Link from "next/link";
import { Check, Clock, CreditCard } from "lucide-react";
import { Card, DemoNotice, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loadWorkspace, requireTeacher } from "@/lib/data/workspace";
import { cancelPlanRequest, requestPlan } from "@/lib/actions/billing";
import { PLANS, YEAR_MONTHS, effectivePlan, planOf } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

const statusNames = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", cancelled: "Anulat", expired: "Expirat" } as const;

type PlanRequest = { id: string; plan_code: string; billing_period: "month" | "year"; note: string | null; created_at: string };

export default async function BillingPage() {
  const [ws, t, { supabase, userId }] = await Promise.all([loadWorkspace(), getT(), requireTeacher()]);
  const demo = ws.mode === "demo";
  const now = new Date();
  const sub = ws.subscription;
  const current = effectivePlan(sub, now);
  const lapsed = sub && planOf(sub.plan_code).code !== current.code;
  const active = ws.students.filter(s => s.status === "active").length;
  const money = (n: number) => formatMoney(n, "MDL", t.locale);

  let pending: PlanRequest | null = null;
  let notReady = false;
  if (supabase && userId) {
    const { data, error } = await supabase.from("plan_requests").select("id, plan_code, billing_period, note, created_at").eq("teacher_id", userId).eq("status", "pending").maybeSingle();
    if (error) notReady = true;
    pending = (data as PlanRequest | null) ?? null;
  }

  return (
    <div>
      <PageHeader title={t("Abonament TeachFlow")} subtitle={t("Planul tău, limitele și schimbarea planului")}
        action={<Link href="/payments" className="tf-btn-ghost">{t("Înapoi")}</Link>} />

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-[20px] bg-primary p-5 text-white shadow-lift">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20"><CreditCard className="h-5 w-5" /></span>
          <div>
            <p className="text-[11px] text-white/80">{t("Planul curent")}</p>
            <p className="text-[18px] font-extrabold">{current.name}</p>
            {sub && <p className="text-[10px] text-white/80">{t(statusNames[sub.status])}{sub.current_period_end ? ` · ${t("până la {date}", { date: formatDate(sub.current_period_end, ws.timezone, t.locale) })}` : ""}</p>}
          </div>
        </div>
        <Card className="p-5">
          <p className="text-[11px] text-muted">{t("Elevi activi")}</p>
          <p className="text-[18px] font-extrabold">{current.studentLimit == null ? active : `${active} / ${current.studentLimit}`}</p>
          {current.studentLimit != null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
              <div className={`h-full rounded-full ${active >= current.studentLimit ? "bg-[#c03a3a]" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.round((active / current.studentLimit) * 100))}%` }} />
            </div>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-[11px] text-muted">{t("Cum se plătește")}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink">{t("Alegi planul și trimiți cererea. Te contactăm cu detaliile de plată (transfer sau card), iar după plată activăm planul.")}</p>
        </Card>
      </div>

      {lapsed && (
        <div className="mb-6 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">
          {t("Planul {plan} nu mai este activ, așa că se aplică limitele planului Free. Trimite o cerere ca să-l reînnoiești.", { plan: planOf(sub!.plan_code).name })}
        </div>
      )}
      {notReady && !demo && (
        <div className="mb-6 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">{t("Aplică migrarea 0005_manual_billing.sql în Supabase pentru abonamente.")}</div>
      )}
      {pending && (
        <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff4de] text-[#a2660a]"><Clock className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 text-[12px]">
            <p className="font-extrabold text-ink">{t("Cerere în așteptare: {plan}", { plan: planOf(pending.plan_code as never).name })} · {pending.billing_period === "year" ? t("anual") : t("lunar")}</p>
            <p className="text-muted">{t("Trimisă pe {date}. Te contactăm cu detaliile de plată.", { date: formatDate(pending.created_at, ws.timezone, t.locale) })}</p>
          </div>
          <form action={cancelPlanRequest}><input type="hidden" name="id" value={pending.id} /><SubmitButton className="tf-btn-ghost">{t("Anulează cererea")}</SubmitButton></form>
        </Card>
      )}

      <SectionTitle>{t("Planuri")}</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map(plan => {
          const isCurrent = plan.code === current.code;
          return (
            <Card key={plan.code} className={`flex flex-col p-5 ${isCurrent ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-extrabold">{plan.name}</h3>
                {isCurrent && <Pill tone="blue">{t("Planul tău")}</Pill>}
              </div>
              <p className="mt-2 text-[22px] font-extrabold">{plan.priceMonth ? money(plan.priceMonth) : t("Gratuit")}<span className="text-[12px] font-bold text-muted">{plan.priceMonth ? ` / ${t("lună")}` : ""}</span></p>
              {plan.priceMonth > 0 && <p className="text-[11px] text-muted">{t("sau {price} pe an (2 luni gratuite)", { price: money(plan.priceMonth * YEAR_MONTHS) })}</p>}
              <p className="mt-3 text-[12px] text-muted">{t(plan.blurb)}</p>
              <ul className="mt-3 space-y-1.5 text-[12px]">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" />{plan.studentLimit == null ? t("Elevi activi nelimitați") : t.n("Până la {n} elev activ|Până la {n} elevi activi|Până la {n} de elevi activi", plan.studentLimit)}</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" />{t("Toate funcțiile: orar, teme, plăți, portalul elevilor")}</li>
              </ul>
              {plan.code !== "free" && !isCurrent && !pending && (
                <div className="mt-auto pt-5">
                  <ActionForm action={requestPlan} demo={demo} submitLabel={t("Solicită planul {plan}", { plan: plan.name })} className="grid gap-2">
                    <input type="hidden" name="plan_code" value={plan.code} />
                    <select name="billing_period" defaultValue="month" aria-label={t("Perioada de plată")} className="tf-input w-full py-2 text-[12px]">
                      <option value="month">{t("Lunar")} · {money(plan.priceMonth)}</option>
                      <option value="year">{t("Anual")} · {money(plan.priceMonth * YEAR_MONTHS)}</option>
                    </select>
                  </ActionForm>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
