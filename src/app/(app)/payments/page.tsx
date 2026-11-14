import { CalendarCheck, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { Card, DemoNotice, PageHeader, Pill, SectionTitle, SubjectIcon } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { courseCards, currencyTotals } from "@/lib/data/derive";
import { dateKey, dayRange, formatDate, formatMoney } from "@/lib/time";
import type { Lesson } from "@/types/database";

const planNames = { free: "Free", starter: "Starter", pro: "Pro", premium: "Premium" } as const;
const statusNames = { trialing: "Perioadă de probă", active: "Activ", past_due: "Plată restantă", cancelled: "Anulat", expired: "Expirat" } as const;

export default async function PaymentsPage() {
  const ws = await loadWorkspace();
  const now = new Date();
  const [y, m] = dateKey(now, ws.timezone).split("-").map(Number);
  const monthStart = dayRange(`${y}-${String(m).padStart(2, "0")}-01`, ws.timezone).start;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const monthEnd = dayRange(next, ws.timezone).start;
  const monthName = new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));

  const course = new Map(ws.courses.map(c => [c.id, c]));
  const seats = (courseId: string) => ws.enrollments.filter(e => e.course_id === courseId && e.status === "active").length;
  // Estimate only: TeachFlow has no payments table yet. Lesson value = course price × participants.
  const value = (l: Lesson) => {
    const c = l.course_id ? course.get(l.course_id) : undefined;
    if (!c || c.price == null) return null;
    return { amount: c.price * (c.format === "group" ? Math.max(1, seats(c.id)) : 1), currency: c.currency };
  };
  const inMonth = ws.lessons.filter(l => new Date(l.starts_at) >= monthStart && new Date(l.starts_at) < monthEnd);
  const earned = currencyTotals(inMonth.filter(l => l.status === "completed").map(value).filter(v => v != null));
  const planned = currencyTotals(inMonth.filter(l => l.status === "scheduled" && new Date(l.starts_at) > now).map(value).filter(v => v != null));
  const doneCount = inMonth.filter(l => l.status === "completed").length;
  const sub = ws.subscription;
  const cards = courseCards(ws, true);

  const money = (list: Array<{ amount: number; currency: string }>) => list.length ? list.map(t => formatMoney(t.amount, t.currency)).join(" + ") : "—";
  const stat = "flex items-center gap-4 p-5";
  const icon = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2";

  return (
    <div>
      <PageHeader title="Finanțe" subtitle={`Rezumat pentru ${monthName}`} />
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${stat} rounded-[20px] bg-primary text-white shadow-lift`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20"><Wallet className="h-5 w-5" /></span>
          <div><p className="text-[11px] text-white/80">Încasări estimate</p><p className="text-[18px] font-extrabold">{money(earned)}</p></div>
        </div>
        <Card className={stat}><span className={icon}><TrendingUp className="h-5 w-5" /></span><div><p className="text-[11px] text-muted">Programat restul lunii</p><p className="text-[18px] font-extrabold">{money(planned)}</p></div></Card>
        <Card className={stat}><span className={icon}><CalendarCheck className="h-5 w-5" /></span><div><p className="text-[11px] text-muted">Lecții ținute</p><p className="text-[18px] font-extrabold">{doneCount}</p></div></Card>
        <Card className={stat}><span className={icon}><CreditCard className="h-5 w-5" /></span><div>
          <p className="text-[11px] text-muted">Abonament TeachFlow</p>
          <p className="text-[18px] font-extrabold">{sub ? planNames[sub.plan_code] : "—"}</p>
          {sub && <p className="text-[10px] text-muted">{statusNames[sub.status]}{sub.current_period_end ? ` · până la ${formatDate(sub.current_period_end, ws.timezone)}` : ""}</p>}
        </div></Card>
      </div>

      <SectionTitle>Prețuri pe curs</SectionTitle>
      <Card className="overflow-hidden">
        {ws.courses.length === 0 && <p className="p-5 text-[12px] text-muted">Niciun curs încă.</p>}
        {ws.courses.map(c => {
          const card = cards.find(x => x.id === c.id)!;
          return (
            <div key={c.id} className="flex items-center gap-4 border-b border-line/70 px-5 py-4 text-[12px] last:border-0">
              <span className={icon}><SubjectIcon kind={card.subject} className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold">{c.title}</div>
                <div className="text-muted">{c.format === "group" ? `Grupă · ${card.studentCount} elevi` : "Individual"}</div>
              </div>
              <Pill tone={c.is_active ? "green" : "gray"}>{c.is_active ? "Activ" : "Inactiv"}</Pill>
              <div className="w-28 text-right font-extrabold">{c.price != null ? `${formatMoney(c.price, c.currency)} / lecție` : "—"}</div>
            </div>
          );
        })}
      </Card>
      <p className="mt-4 text-[11px] text-muted">Sumele sunt estimate din lecțiile finalizate și prețul cursului (× elevii înscriși pentru grupe). Plățile efective vor apărea aici odată cu modulul de plăți.</p>
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
