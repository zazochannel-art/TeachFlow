import Link from "next/link";
import { CalendarDays, ClipboardCheck, MessageCircle, Video, Wallet } from "lucide-react";
import { Card, DemoNotice, EmptyNote, Pill, SectionTitle, SubjectIcon } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { loadStudentPortal } from "@/lib/data/student";
import { subjectKind } from "@/lib/data/derive";
import { submitHomework } from "@/lib/actions/student";
import { dateKey, formatDate, formatDayHeading, formatMoney, formatTime } from "@/lib/time";
import type { Homework } from "@/types/database";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

const hwLabel = { assigned: "De făcut", submitted: "Predată", reviewed: "Verificată" } as const;
const hwTone = { assigned: "amber", submitted: "blue", reviewed: "green" } as const;

export default async function StudentHome() {
  const [p, t] = await Promise.all([loadStudentPortal(), getT()]);
  const now = new Date();
  const tz = p.timezone;
  const today = dateKey(now, tz);
  const course = new Map(p.courses.map(c => [c.id, c]));
  const teacherOf = new Map(p.links.map(l => [l.studentId, l.teacherName]));
  const multiTeacher = new Set(p.links.map(l => l.teacherId)).size > 1;

  const upcoming = p.lessons.filter(l => l.status === "scheduled" && new Date(l.ends_at) > now).slice(0, 8);
  const next = upcoming[0];
  const live = next && new Date(next.starts_at) <= new Date(now.getTime() + 15 * 60000);
  const todo = p.homework.filter(h => h.status === "assigned").sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const done = p.homework.filter(h => h.status !== "assigned").slice(0, 6);
  const pending = p.payments.filter(x => x.status === "pending");
  const unread = p.messages.filter(m => m.direction === "outgoing" && !m.read_at);
  const first = p.name.split(" ")[0];

  if (p.mode === "live" && p.links.length === 0) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-[20px] font-extrabold">{t("Bun venit, {name}!", { name: first })}</h1>
        <p className="mt-2 text-[13px] text-muted">{t("Contul tău nu este încă legat de un profesor. Deschide linkul de invitație primit de la profesor.")}</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <h1 className="text-[24px] font-extrabold tracking-tight">{t("Bună, {name}!", { name: first })}</h1>
        <p className="mt-1 text-[13px] text-muted">{formatDayHeading(today, t.locale).weekday}, {formatDayHeading(today, t.locale).rest}</p>

        <section className="mt-6 rounded-[24px] bg-primary p-6 text-white shadow-lift">
          {next ? (
            <div className="flex flex-wrap items-center gap-5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/20"><Video className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-white/80">{live ? t("Lecția începe acum") : t("Lecția următoare")}</p>
                <p className="truncate text-[19px] font-extrabold">{next.title}</p>
                <p className="text-[12px] text-white/80">{dateKey(new Date(next.starts_at), tz) === today ? t("Astăzi") : formatDate(next.starts_at, tz, t.locale)}, {formatTime(next.starts_at, tz, t.locale)}–{formatTime(next.ends_at, tz, t.locale)}{multiTeacher && next.student_id ? ` · ${teacherOf.get(next.student_id) ?? ""}` : ""}</p>
              </div>
              <Link href={`/student/lesson/${next.id}`} className="rounded-xl bg-white px-5 py-2.5 text-[13px] font-extrabold text-primary-2 hover:bg-tint">{t("Intră în lecție")}</Link>
            </div>
          ) : <p className="text-[14px] font-bold">{t("Nu ai lecții programate deocamdată.")}</p>}
        </section>

        <section className="mt-8">
          <SectionTitle>{t("Teme de făcut")}</SectionTitle>
          {todo.length === 0 ? <EmptyNote>{t("Nicio temă nouă. Bravo!")}</EmptyNote> : (
            <div className="space-y-3">{todo.map(h => <HomeworkCard key={h.id} h={h} tz={tz} courseTitle={h.course_id ? course.get(h.course_id)?.title : undefined} t={t} open />)}</div>
          )}
        </section>

        {done.length > 0 && (
          <section className="mt-8">
            <SectionTitle>{t("Teme predate")}</SectionTitle>
            <div className="space-y-3">{done.map(h => <HomeworkCard key={h.id} h={h} tz={tz} courseTitle={h.course_id ? course.get(h.course_id)?.title : undefined} t={t} />)}</div>
          </section>
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
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><SubjectIcon kind={subjectKind(c?.subject ?? null, l.title)} className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-extrabold">{l.title}</p>
                    <p className="text-[11px] text-muted"><CalendarDays className="mr-1 inline h-3 w-3" />{formatDate(l.starts_at, tz, t.locale)} · {formatTime(l.starts_at, tz, t.locale)}</p>
                  </div>
                  <Link href={`/student/lesson/${l.id}`} aria-label={t("Intră în lecție · {title}", { title: l.title })} className="grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2 hover:bg-[#dfe4fb]"><Video className="h-3.5 w-3.5" /></Link>
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <SectionTitle>{t("Plăți")}</SectionTitle>
          <Card className="overflow-hidden">
            {p.payments.length === 0 && <p className="p-5 text-[12px] text-muted">{t("Nicio plată înregistrată.")}</p>}
            {[...pending, ...p.payments.filter(x => x.status === "paid").slice(0, 5)].map(x => {
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

        <Link href="/student/messages" className="flex items-center gap-3 rounded-[20px] border border-line/70 bg-white p-4 shadow-card hover:border-primary">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-tint text-primary-2"><MessageCircle className="h-4 w-4" /></span>
          <span className="flex-1 text-[13px] font-extrabold">{t("Scrie-i profesorului")}</span>
          {unread.length > 0 && <Pill tone="blue">{t("{n} noi", { n: unread.length })}</Pill>}
        </Link>
      </aside>
    </div>
  );
}

function HomeworkCard({ h, tz, courseTitle, t, open = false }: { h: Homework; tz: string; courseTitle?: string; t: T; open?: boolean }) {
  const overdue = h.status === "assigned" && h.due_at && new Date(h.due_at) < new Date();
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><ClipboardCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold">{h.title}</p>
          <p className="text-[11px] text-muted">{[courseTitle, h.due_at ? t("termen {date}", { date: `${formatDate(h.due_at, tz, t.locale)}, ${formatTime(h.due_at, tz, t.locale)}` }) : null].filter(Boolean).join(" · ")}</p>
        </div>
        <Pill tone={overdue ? "red" : hwTone[h.status]}>{overdue ? t("Întârziată") : t(hwLabel[h.status])}</Pill>
      </div>
      {h.description && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{h.description}</p>}
      {h.submission && !open && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-soft px-3 py-2 text-[12px] text-ink"><b>{t("Răspunsul tău:")}</b> {h.submission}</p>}
      {h.status === "reviewed" && (h.grade || h.feedback) && (
        <p className="mt-3 rounded-xl bg-[#e7f6ee] px-3 py-2 text-[12px] text-[#11603f]">{h.grade && <b>{t("Nota: {grade}", { grade: h.grade })}. </b>}{h.feedback}</p>
      )}
      {open && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] font-bold text-primary">{t("Predă tema")}</summary>
          <div className="mt-3">
            <ActionForm action={submitHomework} submitLabel={t("Trimite tema")} className="grid gap-3">
              <input type="hidden" name="homework_id" value={h.id} />
              <textarea name="submission" required rows={5} maxLength={8000} className="tf-input" placeholder={t("Scrie răspunsul sau lipește un link (Google Docs, Drive etc.)")} defaultValue={h.submission ?? ""} />
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  );
}
