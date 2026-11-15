import { Card } from "@/components/ui";
import { colorVar } from "@/lib/colors";
import { colorOf } from "@/lib/data/derive";
import type { Workspace } from "@/lib/data/workspace";
import { dateKey, formatMoney } from "@/lib/time";
import type { T } from "@/lib/i18n/core";

/**
 * Income of the last 6 months (paid by month of payment, pending by due month) and the split
 * by course. Amounts in other currencies than the main one are left out and mentioned.
 */
export function FinanceChart({ ws, now, t }: { ws: Workspace; now: Date; t: T }) {
  const tz = ws.timezone;
  if (!ws.payments.length) return null;

  const byCur = new Map<string, number>();
  for (const p of ws.payments) byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + 1);
  const cur = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const others = byCur.size > 1;

  const [y, m] = dateKey(now, tz).split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 6 + i, 1));
    return { key: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat(t.locale, { month: "short", timeZone: "UTC" }).format(d).replace(".", "") };
  });
  const keys = new Set(months.map(x => x.key));
  const paid = new Map<string, number>(), pending = new Map<string, number>();
  const perCourse = new Map<string, number>();
  for (const p of ws.payments) {
    if (p.currency !== cur) continue;
    if (p.status === "paid" && p.paid_at) {
      const k = dateKey(new Date(p.paid_at), tz).slice(0, 7);
      if (!keys.has(k)) continue;
      paid.set(k, (paid.get(k) ?? 0) + p.amount);
      perCourse.set(p.course_id ?? "", (perCourse.get(p.course_id ?? "") ?? 0) + p.amount);
    } else if (p.status === "pending") {
      const k = (p.due_date ?? dateKey(now, tz)).slice(0, 7);
      if (keys.has(k)) pending.set(k, (pending.get(k) ?? 0) + p.amount);
    }
  }
  const max = Math.max(1, ...months.map(x => (paid.get(x.key) ?? 0) + (pending.get(x.key) ?? 0)));
  const total = [...perCourse.values()].reduce((a, b) => a + b, 0);
  const money = (n: number) => formatMoney(n, cur, t.locale);
  const thisKey = months[5].key;
  const split = [...perCourse.entries()].sort((a, b) => b[1] - a[1]).map(([id, amount]) => ({
    id, amount, color: colorOf(ws, id || null),
    title: ws.courses.find(c => c.id === id)?.title ?? t("Fără curs")
  }));

  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-extrabold text-ink">{t("Încasări pe ultimele 6 luni")}</h2>
          <div className="flex items-center gap-3 text-[11px] font-bold text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />{t("Încasat")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/30" />{t("De încasat")}</span>
          </div>
        </div>
        <div className="flex h-[180px] items-end gap-2 sm:gap-4" role="img" aria-label={t("Încasări pe ultimele 6 luni")}>
          {months.map(mo => {
            const a = paid.get(mo.key) ?? 0, b = pending.get(mo.key) ?? 0;
            return (
              <div key={mo.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className={`text-[10px] font-extrabold ${a ? "text-ink" : "text-transparent"}`}>{a ? money(a).replace(/\s?[A-Z]{3}$/, "") : "0"}</span>
                <div className="flex w-full max-w-[46px] flex-col justify-end overflow-hidden rounded-t-[10px] rounded-b-[4px]" style={{ height: `${((a + b) / max) * 130}px`, minHeight: a + b ? 6 : 2 }}
                  title={`${mo.label}: ${money(a)}${b ? ` · ${t("De încasat")}: ${money(b)}` : ""}`}>
                  {b > 0 && <div className="w-full bg-primary/30" style={{ height: `${(b / (a + b)) * 100}%` }} />}
                  <div className={`w-full ${mo.key === thisKey ? "bg-primary" : "bg-primary/75"} ${a + b === 0 ? "bg-line" : ""}`} style={{ height: a + b ? `${(a / (a + b)) * 100}%` : "100%" }} />
                </div>
                <span className={`text-[11px] font-bold capitalize ${mo.key === thisKey ? "text-primary" : "text-muted"}`}>{mo.label}</span>
              </div>
            );
          })}
        </div>
        {others && <p className="mt-3 text-[10px] text-muted">{t("Sumele sunt în {cur}; plățile în alte monede nu apar în grafic.", { cur })}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-[14px] font-extrabold text-ink">{t("Pe cursuri")}</h2>
        <p className="mb-4 text-[11px] text-muted">{t("Încasat în ultimele 6 luni: {sum}", { sum: money(total) })}</p>
        {total > 0 ? (
          <>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-soft">
              {split.map(s => <div key={s.id} className="tf-c-dot h-full" style={{ ...colorVar(s.color), width: `${(s.amount / total) * 100}%` }} title={`${s.title}: ${money(s.amount)}`} />)}
            </div>
            <ul className="space-y-2.5">
              {split.slice(0, 5).map(s => (
                <li key={s.id} className="flex items-center gap-2.5 text-[12px]">
                  <span className="tf-c-dot h-2.5 w-2.5 shrink-0 rounded-full" style={colorVar(s.color)} />
                  <span className="min-w-0 flex-1 truncate font-bold text-ink">{s.title}</span>
                  <span className="shrink-0 text-muted">{Math.round((s.amount / total) * 100)}%</span>
                  <span className="w-24 shrink-0 text-right font-extrabold">{money(s.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="text-[12px] text-muted">{t("Încă nu ai încasări în această perioadă.")}</p>}
      </Card>
    </div>
  );
}
