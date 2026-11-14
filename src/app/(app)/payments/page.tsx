import Link from "next/link";
import { AlertCircle, CalendarCheck, Check, CreditCard, Download, Pencil, Plus, TrendingUp, Wallet } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, Field, MigrationNotice, PageHeader, Panel, Pill, SectionTitle, SubjectIcon, Tabs } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { loadWorkspace } from "@/lib/data/workspace";
import { courseCards, currencyTotals } from "@/lib/data/derive";
import { deletePayment, markPaymentPaid, savePayment } from "@/lib/actions/payments";
import { dateKey, dayRange, formatDate, formatMoney } from "@/lib/time";
import { effectivePlan } from "@/lib/plans";
import type { Lesson, Payment } from "@/types/database";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

const statusNames = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", cancelled: "Anulat", expired: "Expirat" } as const;
const methods = { cash: "Numerar", card: "Card", transfer: "Transfer", other: "Altă metodă" } as const;
type Params = { status?: string; new?: string; edit?: string; student?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const sp = await searchParams;
  const demo = ws.mode === "demo";
  const missing = ws.missingTables.includes("payments");
  const now = new Date();
  const today = dateKey(now, ws.timezone);
  const [y, m] = today.split("-").map(Number);
  const monthStart = dayRange(`${y}-${String(m).padStart(2, "0")}-01`, ws.timezone).start;
  const monthEnd = dayRange(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), ws.timezone).start;
  const monthName = new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));

  const course = new Map(ws.courses.map(c => [c.id, c]));
  const student = new Map(ws.students.map(s => [s.id, s]));
  const seats = (courseId: string) => ws.enrollments.filter(e => e.course_id === courseId && e.status === "active").length;
  const value = (l: Lesson) => {
    const c = l.course_id ? course.get(l.course_id) : undefined;
    if (!c || c.price == null) return null;
    return { amount: c.price * (c.format === "group" ? Math.max(1, seats(c.id)) : 1), currency: c.currency };
  };
  const inMonth = ws.lessons.filter(l => new Date(l.starts_at) >= monthStart && new Date(l.starts_at) < monthEnd);
  const estimate = currencyTotals(inMonth.filter(l => l.status === "completed").map(value).filter(v => v != null));

  const paidThisMonth = ws.payments.filter(p => p.status === "paid" && p.paid_at && new Date(p.paid_at) >= monthStart && new Date(p.paid_at) < monthEnd);
  const pending = ws.payments.filter(p => p.status === "pending");
  const overdue = pending.filter(p => p.due_date && p.due_date < today);
  const money = (list: Array<{ amount: number; currency: string }>) => list.length ? currencyTotals(list).map(x => formatMoney(x.amount, x.currency, t.locale)).join(" + ") : "—";

  const filter = (["all", "paid", "pending", "overdue"] as const).find(f => f === sp.status) ?? "all";
  const list = filter === "all" ? ws.payments : filter === "overdue" ? overdue : ws.payments.filter(p => p.status === filter);
  const editing = sp.edit ? ws.payments.find(p => p.id === sp.edit) : undefined;
  const sub = ws.subscription;
  const cards = courseCards(ws, true);
  const stat = "flex items-center gap-4 p-5";
  const icon = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2";

  return (
    <div>
      <PageHeader title={t("Finanțe")} subtitle={t("Rezumat pentru {month}", { month: monthName })}
        action={!missing && <Link href="/payments?new=1" className="tf-btn"><Plus className="h-4 w-4" /> {t("Înregistrează plată")}</Link>} />
      {missing && <MigrationNotice table="payments" />}

      {(sp.new || editing) && !missing && (
        <Panel title={editing ? t("Editează plata") : t("Plată nouă")} closeHref={`/payments?status=${filter}`}>
          <PaymentForm demo={demo} payment={editing} defaultStudent={sp.student} today={today} ws={ws} t={t} />
        </Panel>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${stat} rounded-[20px] bg-primary text-white shadow-lift`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20"><Wallet className="h-5 w-5" /></span>
          <div><p className="text-[11px] text-white/80">{t("Încasat luna aceasta")}</p><p className="text-[18px] font-extrabold">{missing ? "—" : money(paidThisMonth)}</p></div>
        </div>
        <Card className={stat}><span className={`${icon} ${overdue.length ? "bg-[#fdecec] text-[#c03a3a]" : ""}`}><AlertCircle className="h-5 w-5" /></span><div>
          <p className="text-[11px] text-muted">{t("De încasat")}{overdue.length ? ` · ${t.n("{n} restantă|{n} restante|{n} de restante", overdue.length)}` : ""}</p><p className="text-[18px] font-extrabold">{money(pending)}</p>
        </div></Card>
        <Card className={stat}><span className={icon}><TrendingUp className="h-5 w-5" /></span><div>
          <p className="text-[11px] text-muted">{t("Valoarea lecțiilor ținute")}</p><p className="text-[18px] font-extrabold">{money(estimate)}</p>
          <p className="text-[10px] text-muted">{t("{n} lecții × preț curs", { n: inMonth.filter(l => l.status === "completed").length })}</p>
        </div></Card>
        <Link href="/billing" className="block rounded-[20px] transition-shadow hover:shadow-md"><Card className={`${stat} h-full`}><span className={icon}><CreditCard className="h-5 w-5" /></span><div>
          <p className="text-[11px] text-muted">{t("Abonament TeachFlow")}</p>
          <p className="text-[18px] font-extrabold">{effectivePlan(sub).name}</p>
          {sub && <p className="text-[10px] text-muted">{t(statusNames[sub.status])}{sub.current_period_end ? ` · ${t("până la {date}", { date: formatDate(sub.current_period_end, ws.timezone, t.locale) })}` : ""}</p>}
          <p className="mt-1 text-[10px] font-bold text-primary">{t("Schimbă planul")} →</p>
        </div></Card></Link>
      </div>

      {!missing && (
        <>
          <SectionTitle action={list.length > 0 && <a href={`/payments/export${filter === "all" ? "" : `?status=${filter}`}`} download className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-2"><Download className="h-3.5 w-3.5" /> {t("Exportă CSV")}</a>}>{t("Plăți")}</SectionTitle>
          <Tabs active={filter} items={[
            { key: "all", label: t("Toate"), href: "/payments", count: ws.payments.length },
            { key: "paid", label: t("Încasate"), href: "/payments?status=paid", count: ws.payments.length - pending.length },
            { key: "pending", label: t("De încasat"), href: "/payments?status=pending", count: pending.length },
            { key: "overdue", label: t("Restante"), href: "/payments?status=overdue", count: overdue.length }
          ]} />
          {list.length === 0 ? (
            <EmptyState icon={CalendarCheck} title={t("Nicio plată aici")} text={t("Înregistrează plățile primite de la elevi sau sumele de încasat, cu termen de plată.")} action={<Link href="/payments?new=1" className="tf-btn">{t("Înregistrează o plată")}</Link>} />
          ) : (
            <Card className="mb-8 overflow-hidden">
              {list.map(p => {
                const st = student.get(p.student_id);
                const late = p.status === "pending" && p.due_date && p.due_date < today;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 px-5 py-4 text-[12px] last:border-0">
                    <Avatar name={st?.full_name ?? "?"} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-extrabold">{st?.full_name ?? t("Elev șters")}</div>
                      <div className="truncate text-muted">{[p.course_id ? course.get(p.course_id)?.title : null, p.method ? t(methods[p.method]) : null, p.note].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="text-muted">{p.status === "paid" ? t("încasat {date}", { date: p.paid_at ? formatDate(p.paid_at, ws.timezone, t.locale) : "" }) : p.due_date ? t("termen {date}", { date: formatDate(`${p.due_date}T12:00:00Z`, "UTC", t.locale) }) : t("fără termen")}</div>
                    <Pill tone={p.status === "paid" ? "green" : late ? "red" : "amber"}>{p.status === "paid" ? t("Încasată") : late ? t("Restantă") : t("De încasat")}</Pill>
                    <div className="w-28 text-right text-[13px] font-extrabold">{formatMoney(p.amount, p.currency, t.locale)}</div>
                    <div className="flex items-center gap-2">
                      {p.status === "pending" && (
                        <form action={markPaymentPaid}><input type="hidden" name="id" value={p.id} />
                          <SubmitButton className="inline-flex items-center gap-1 rounded-xl bg-tint px-3 py-1.5 font-bold text-primary-2 hover:bg-[#dfe4fb]"><Check className="h-3.5 w-3.5" /> {t("Încasată")}</SubmitButton>
                        </form>
                      )}
                      <Link href={`/payments?status=${filter}&edit=${p.id}`} aria-label={t("Editează plata")} className="grid h-8 w-8 place-items-center rounded-full bg-soft text-muted hover:text-primary"><Pencil className="h-3.5 w-3.5" /></Link>
                      <form action={deletePayment}><input type="hidden" name="id" value={p.id} /><ConfirmSubmit label="×" confirm={t("Șterge")} className="py-1.5" /></form>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      <SectionTitle>{t("Prețuri pe curs")}</SectionTitle>
      <Card className="overflow-hidden">
        {ws.courses.length === 0 && <p className="p-5 text-[12px] text-muted">{t("Niciun curs încă.")}</p>}
        {ws.courses.map(c => {
          const card = cards.find(x => x.id === c.id)!;
          return (
            <div key={c.id} className="flex items-center gap-4 border-b border-line/70 px-5 py-4 text-[12px] last:border-0">
              <span className={icon}><SubjectIcon kind={card.subject} className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold">{c.title}</div>
                <div className="text-muted">{c.format === "group" ? `${t("Grupă")} · ${t.n("{n} elev|{n} elevi|{n} de elevi", card.studentCount)}` : t("Individual")}</div>
              </div>
              <Pill tone={c.is_active ? "green" : "gray"}>{c.is_active ? t("Activ") : t("Inactiv")}</Pill>
              <Link href={`/courses?edit=${c.id}`} className="w-32 text-right font-extrabold hover:text-primary">{c.price != null ? t("{price} / lecție", { price: formatMoney(c.price, c.currency, t.locale) }) : t("Setează prețul")}</Link>
            </div>
          );
        })}
      </Card>
      {demo && <DemoNotice />}
    </div>
  );
}

function PaymentForm({ ws, demo, payment, defaultStudent, today, t }: { ws: Awaited<ReturnType<typeof loadWorkspace>>; demo: boolean; payment?: Payment; defaultStudent?: string; today: string; t: T }) {
  const date = payment?.status === "paid" && payment.paid_at ? dateKey(new Date(payment.paid_at), ws.timezone) : payment?.due_date ?? today;
  return (
    <ActionForm action={savePayment} demo={demo} submitLabel={payment ? t("Salvează") : t("Înregistrează")}>
      {payment && <input type="hidden" name="id" value={payment.id} />}
      <Field label={t("Elev")} htmlFor="student_id">
        <select id="student_id" name="student_id" required defaultValue={payment?.student_id ?? defaultStudent ?? ""} className="tf-input">
          <option value="" disabled>{t("Alege elevul…")}</option>
          {ws.students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </Field>
      <Field label={t("Curs (opțional)")} htmlFor="course_id">
        <select id="course_id" name="course_id" defaultValue={payment?.course_id ?? ""} className="tf-input">
          <option value="">—</option>
          {ws.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label={t("Sumă")} htmlFor="amount"><input id="amount" name="amount" required inputMode="decimal" defaultValue={payment?.amount?.toString() ?? ""} className="tf-input" /></Field>
        <Field label={t("Monedă")} htmlFor="currency">
          <select id="currency" name="currency" defaultValue={payment?.currency ?? ws.teacherProfile?.currency ?? "MDL"} className="tf-input">{["MDL", "EUR", "RON", "USD"].map(c => <option key={c}>{c}</option>)}</select>
        </Field>
      </div>
      <Field label={t("Status")} htmlFor="status">
        <select id="status" name="status" defaultValue={payment?.status ?? "paid"} className="tf-input">
          <option value="paid">{t("Încasată")}</option>
          <option value="pending">{t("De încasat")}</option>
        </select>
      </Field>
      <Field label={t("Data încasării / termenul")} htmlFor="date"><input id="date" name="date" type="date" required defaultValue={date} className="tf-input" /></Field>
      <Field label={t("Metodă")} htmlFor="method">
        <select id="method" name="method" defaultValue={payment?.method ?? ""} className="tf-input">
          <option value="">—</option>
          {Object.entries(methods).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
      </Field>
      <Field label={t("Notă")} htmlFor="note" wide><input id="note" name="note" defaultValue={payment?.note ?? ""} className="tf-input" placeholder={t("ex. abonament 8 lecții")} /></Field>
    </ActionForm>
  );
}
