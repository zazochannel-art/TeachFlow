import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardCheck, MessageCircle, Wallet, XCircle } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyNote, Pill, SectionTitle, SubjectIcon } from "@/components/ui";
import { loadParentPortal, lessonsOfChild } from "@/lib/data/parent";
import { colorOf, currencyTotals, subjectKind } from "@/lib/data/derive";
import { colorVar } from "@/lib/colors";
import { ageOn, dateKey, formatDate, formatMoney, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { ChildPicker } from "./ChildPicker";

const hwLabel = { assigned: "De făcut", submitted: "Predată", reviewed: "Verificată" } as const;
const hwTone = { assigned: "amber", submitted: "blue", reviewed: "green" } as const;

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const [p, t, sp] = await Promise.all([loadParentPortal(), getT(), searchParams]);
  const now = new Date();
  const tz = p.timezone;
  const today = dateKey(now, tz);
  const first = p.name.split(" ")[0];

  if (p.children.length === 0) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-[20px] font-extrabold">{t("Bun venit, {name}!", { name: first })}</h1>
        <p className="mt-2 text-[13px] text-muted">{t("Contul tău nu este încă legat de niciun copil. Deschide linkul de invitație primit de la profesor.")}</p>
      </Card>
    );
  }

  const child = p.children.find(c => c.studentId === sp.c) ?? p.children[0];
  const course = new Map(p.courses.map(c => [c.id, c]));
  const lessons = lessonsOfChild(p, child.studentId);
  const upcoming = lessons.filter(l => l.status === "scheduled" && new Date(l.ends_at) > now).slice(0, 6);
  const past = lessons.filter(l => new Date(l.ends_at) <= now && l.status !== "scheduled").reverse();
  const monthAgo = now.getTime() - 30 * 86400000;
  const recent = past.filter(l => new Date(l.starts_at).getTime() >= monthAgo && l.status !== "cancelled");
  const held = recent.filter(l => l.status === "completed").length;
  const missed = recent.filter(l => l.status === "no_show").length;
  const homework = p.homework.filter(h => h.student_id === child.studentId);
  const todo = homework.filter(h => h.status === "assigned");
  const payments = p.payments.filter(x => x.student_id === child.studentId);
  const pending = payments.filter(x => x.status === "pending");
  const dueTotal = pending.length ? currencyTotals(pending).map(x => formatMoney(x.amount, x.currency, t.locale)).join(" + ") : null;
  const age = child.birthDate ? ageOn(child.birthDate, now) : null;
  const unread = p.messages.filter(m => m.student_id === child.studentId && m.direction === "outgoing" && !m.read_at).length;
  const q = p.children.length > 1 ? `?c=${child.studentId}` : "";

  return (
    <div>
      <ChildPicker items={p.children} active={child.studentId} base="/parent" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={child.name} src={child.avatarUrl} size={56} className="ring-4 ring-tint" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[24px] font-extrabold tracking-tight">{child.name}</h1>
              <p className="mt-0.5 text-[13px] text-muted">{[age != null ? t.n("{n} an|{n} ani|{n} de ani", age) : null, child.gradeLevel, t("profesor: {name}", { name: child.teacherName })].filter(Boolean).join(" · ")}</p>
            </div>
            <Link href={`/parent/messages${q}`} className="tf-btn-ghost w-full sm:w-auto"><MessageCircle className="h-4 w-4" /> {t("Scrie profesorului")}{unread > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white">{unread}</span>}</Link>
          </div>

          <div className="mt-8"><SectionTitle>{t("Pe scurt · ultimele 30 de zile")}</SectionTitle></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t("Lecții ținute")} value={String(held)} />
            <Tile label={t("Absențe")} value={String(missed)} tone={missed ? "red" : undefined} />
            <Tile label={t("Teme de făcut")} value={String(todo.length)} tone={todo.length ? "amber" : undefined} />
            <Tile label={t("De achitat")} value={dueTotal ?? t("La zi")} tone={dueTotal ? "amber" : "green"} />
          </div>

          <div className="mt-8"><SectionTitle>{t("Prezența")}</SectionTitle></div>
          {past.length === 0 ? <EmptyNote>{t("Nicio lecție încă.")}</EmptyNote> : (
            <Card className="divide-y divide-line">
              {past.slice(0, 12).map(l => {
                const group = !l.student_id;
                const label = l.status === "cancelled" ? t("Anulată") : l.status === "no_show" ? t("Absent") : group ? t("Ținută") : t("Prezent");
                const tone = l.status === "no_show" ? "red" : l.status === "cancelled" ? "gray" : "green";
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3 text-[12px]">
                    {l.status === "no_show" ? <XCircle className="h-4 w-4 shrink-0 text-[#c03a3a]" /> : <CheckCircle2 className={`h-4 w-4 shrink-0 ${l.status === "cancelled" ? "text-muted" : "text-[#1b8a5a]"}`} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-ink">{l.title}</p>
                      <p className="text-[11px] text-muted">{formatDate(l.starts_at, tz, t.locale)}, {formatTime(l.starts_at, tz, t.locale)}{group ? ` · ${t("lecție de grup")}` : ""}</p>
                    </div>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                );
              })}
            </Card>
          )}

          <div className="mt-8"><SectionTitle>{t("Teme")}</SectionTitle></div>
          {homework.length === 0 ? <EmptyNote>{t("Nicio temă încă.")}</EmptyNote> : (
            <Card className="divide-y divide-line">
              {homework.slice(0, 15).map(h => {
                const overdue = h.status === "assigned" && h.due_at && new Date(h.due_at) < now;
                return (
                  <div key={h.id} className="px-4 py-3 text-[12px]">
                    <div className="flex items-center gap-3">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-primary-2" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-extrabold text-ink">{h.title}</p>
                        <p className="truncate text-[11px] text-muted">{[h.course_id ? course.get(h.course_id)?.title : null, h.due_at ? t("termen {date}", { date: formatDate(h.due_at, tz, t.locale) }) : null].filter(Boolean).join(" · ")}</p>
                      </div>
                      {h.grade && <Pill tone="green">{t("Nota: {grade}", { grade: h.grade })}</Pill>}
                      <Pill tone={overdue ? "red" : hwTone[h.status]}>{overdue ? t("Întârziată") : t(hwLabel[h.status])}</Pill>
                    </div>
                    {h.status === "reviewed" && h.feedback && <p className="ml-7 mt-2 rounded-xl bg-[#e7f6ee] px-3 py-2 text-[12px] text-[#11603f]">{h.feedback}</p>}
                  </div>
                );
              })}
            </Card>
          )}
          {p.mode === "demo" && <DemoNotice />}
        </div>

        <aside className="space-y-8">
          <section>
            <SectionTitle>{t("Orar")}</SectionTitle>
            <Card className="overflow-hidden">
              {upcoming.length === 0 && <p className="p-5 text-[12px] text-muted">{t("Nicio lecție programată.")}</p>}
              {upcoming.map(l => {
                const c = l.course_id ? course.get(l.course_id) : undefined;
                return (
                  <div key={l.id} className="flex items-center gap-3 border-b border-line/70 px-4 py-3 last:border-0">
                    <span style={colorVar(colorOf(p, l.course_id))} className="tf-c-soft tf-c-ink grid h-10 w-10 shrink-0 place-items-center rounded-full"><SubjectIcon kind={subjectKind(c?.subject ?? null, l.title)} className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold">{l.title}</p>
                      <p className="text-[11px] text-muted"><CalendarDays className="mr-1 inline h-3 w-3" />{dateKey(new Date(l.starts_at), tz) === today ? t("Astăzi") : formatDate(l.starts_at, tz, t.locale)} · {formatTime(l.starts_at, tz, t.locale)}–{formatTime(l.ends_at, tz, t.locale)}</p>
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>

          <section>
            <SectionTitle>{t("Plăți")}</SectionTitle>
            <Card className="overflow-hidden">
              {payments.length === 0 && <p className="p-5 text-[12px] text-muted">{t("Nicio plată înregistrată.")}</p>}
              {[...pending, ...payments.filter(x => x.status === "paid").slice(0, 6)].map(x => {
                const late = x.status === "pending" && x.due_date && x.due_date < today;
                return (
                  <div key={x.id} className="flex items-center gap-3 border-b border-line/70 px-4 py-3 text-[12px] last:border-0">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${late ? "bg-[#fdecec] text-[#c03a3a]" : "bg-tint text-primary-2"}`}><Wallet className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">{formatMoney(x.amount, x.currency, t.locale)}</p>
                      <p className="truncate text-muted">{x.status === "paid" ? t("achitat {date}", { date: x.paid_at ? formatDate(x.paid_at, tz, t.locale) : "" }) : x.due_date ? t("termen {date}", { date: formatDate(`${x.due_date}T12:00:00Z`, "UTC", t.locale) }) : t("de achitat")}{x.course_id && course.get(x.course_id) ? ` · ${course.get(x.course_id)!.title}` : ""}</p>
                    </div>
                    <Pill tone={x.status === "paid" ? "green" : late ? "red" : "amber"}>{x.status === "paid" ? t("Achitat") : late ? t("Restant") : t("De achitat")}</Pill>
                  </div>
                );
              })}
            </Card>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" | "green" }) {
  const color = tone === "red" ? "text-[#c03a3a]" : tone === "amber" ? "text-[#a2660a]" : tone === "green" ? "text-[#1b8a5a]" : "text-ink";
  return (
    <div className="rounded-2xl bg-soft px-4 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`truncate text-[18px] font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
