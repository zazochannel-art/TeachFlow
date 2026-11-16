import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileText, Star, Video, Wallet } from "lucide-react";
import { Card, DemoNotice, EmptyNote, Pill, SectionTitle, SubjectIcon } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { loadStudentPortal } from "@/lib/data/student";
import { colorOf, subjectKind } from "@/lib/data/derive";
import { colorVar } from "@/lib/colors";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Avatar } from "@/components/ui";
import { submitHomework } from "@/lib/actions/student";
import { dateKey, formatDate, formatDayHeading, formatMoney, formatTime } from "@/lib/time";
import type { Homework } from "@/types/database";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";
import { FileAttach } from "@/components/FileAttach";
import { FileList } from "@/components/FileList";
import { storedFiles } from "@/lib/files";
import { signFiles } from "@/lib/data/files";
import { demoProgress, loadPortalProgress } from "@/lib/data/progress";
import { ProgressSummary } from "@/components/ProgressView";

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
  const first = p.name.split(" ")[0];
  const files = p.mode === "live";
  const [links, progress] = await Promise.all([
    files ? signFiles([...todo, ...done].flatMap(h => [...storedFiles(h.attachments), ...storedFiles(h.submission_files)])) : Promise.resolve({} as Record<string, string>),
    p.mode === "demo" ? Promise.resolve(demoProgress(p, tz)) : loadPortalProgress(p.links, tz)
  ]);
  const folderFor = (h: Homework) => (files && p.userId ? `sub/${p.userId}/${h.id}` : undefined);

  // Progress over the last 30 days (the window the portal loads).
  const monthAgo = now.getTime() - 30 * 86400000;
  const recent = p.lessons.filter(l => new Date(l.starts_at).getTime() >= monthAgo && new Date(l.ends_at) <= now && l.status !== "cancelled");
  const held = recent.filter(l => l.status === "completed").length;
  const missed = recent.filter(l => l.status === "no_show").length;
  const hwRecent = p.homework.filter(h => new Date(h.created_at).getTime() >= monthAgo);
  const hwDone = hwRecent.filter(h => h.status !== "assigned").length;
  const graded = p.homework.filter(h => h.status === "reviewed" && h.grade).length;
  const courseProgress = p.courses.map(c => {
    const ls = p.lessons.filter(l => l.course_id === c.id && l.status !== "cancelled");
    const doneL = ls.filter(l => l.status === "completed" || l.status === "no_show").length;
    return { id: c.id, title: c.title, color: colorOf(p, c.id), done: doneL, total: ls.length };
  }).filter(c => c.total > 0);

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
        <div className="flex items-center gap-4">
          {p.mode === "live"
            ? <AvatarUpload name={p.name} src={p.avatarUrl} size={56} />
            : <Avatar name={p.name} src={p.avatarUrl} size={56} className="ring-4 ring-tint" />}
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold tracking-tight">{t("Bună, {name}!", { name: first })}</h1>
            <p className="mt-0.5 text-[13px] text-muted">{formatDayHeading(today, t.locale).weekday}, {formatDayHeading(today, t.locale).rest}</p>
          </div>
        </div>

        <section style={colorVar(next ? colorOf(p, next.course_id) : "#5269e8")} className="tf-c-tile tf-rise mt-6 rounded-[24px] p-5 shadow-lift sm:p-6">
          {next ? (
            <div className="flex flex-wrap items-center gap-4 sm:gap-5">
              <span className="grid h-12 w-12 shrink-0 sm:h-14 sm:w-14 place-items-center rounded-full bg-white/20"><Video className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-white/80">{live ? t("Lecția începe acum") : t("Lecția următoare")}</p>
                <p className="truncate text-[19px] font-extrabold">{next.title}</p>
                <p className="text-[12px] text-white/80">{dateKey(new Date(next.starts_at), tz) === today ? t("Astăzi") : formatDate(next.starts_at, tz, t.locale)}, {formatTime(next.starts_at, tz, t.locale)}–{formatTime(next.ends_at, tz, t.locale)}{multiTeacher && next.student_id ? ` · ${teacherOf.get(next.student_id) ?? ""}` : ""}</p>
              </div>
              <Link href={`/student/lesson/${next.id}`} className="w-full rounded-xl bg-white px-5 py-3 text-center text-[13px] font-extrabold tf-c-ink hover:brightness-95 sm:w-auto sm:py-2.5">{t("Intră în lecție")}</Link>
            </div>
          ) : <p className="text-[14px] font-bold">{t("Nu ai lecții programate deocamdată.")}</p>}
        </section>

        <section className="mt-8">
          <SectionTitle>{t("Progresul tău · ultimele 30 de zile")}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <ProgressTile label={t("Lecții ținute")} value={String(held)} sub={missed ? t("{n} absențe", { n: missed }) : t("fără absențe")} ratio={held + missed ? held / (held + missed) : null} />
            <ProgressTile label={t("Teme predate")} value={`${hwDone}/${hwRecent.length}`} sub={hwRecent.length === hwDone ? t("toate la zi") : t("{n} de făcut", { n: hwRecent.length - hwDone })} ratio={hwRecent.length ? hwDone / hwRecent.length : null} />
            <ProgressTile label={t("Teme cu notă")} value={String(graded)} sub={t("de la începutul cursului")} ratio={null} />
          </div>
          {courseProgress.length > 0 && (
            <Card className="mt-3 space-y-3.5 p-5">
              {courseProgress.map(c => (
                <div key={c.id} style={colorVar(c.color)}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex min-w-0 items-center gap-2 font-extrabold"><span className="tf-c-dot h-2.5 w-2.5 shrink-0 rounded-full" /><span className="truncate">{c.title}</span></span>
                    <span className="shrink-0 font-bold text-muted">{t("{done} din {total} lecții ținute", { done: c.done, total: c.total })}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-soft"><div className="tf-c-dot h-full rounded-full" style={{ width: `${Math.round((c.done / c.total) * 100)}%` }} /></div>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section className="mt-8">
          <SectionTitle>{t("Teme de făcut")}</SectionTitle>
          {todo.length === 0 ? <EmptyNote>{t("Nicio temă nouă. Bravo!")}</EmptyNote> : (
            <div className="space-y-3">{todo.map(h => <HomeworkCard key={h.id} h={h} tz={tz} courseTitle={h.course_id ? course.get(h.course_id)?.title : undefined} t={t} open links={links} folder={folderFor(h)} />)}</div>
          )}
        </section>

        {done.length > 0 && (
          <section className="mt-8">
            <SectionTitle>{t("Teme predate")}</SectionTitle>
            <div className="space-y-3">{done.map(h => <HomeworkCard key={h.id} h={h} tz={tz} courseTitle={h.course_id ? course.get(h.course_id)?.title : undefined} t={t} links={links} />)}</div>
          </section>
        )}
        {p.mode === "demo" && <DemoNotice />}
      </div>

      <aside className="space-y-8">
        {progress && <section><SectionTitle action={<Link href="/student/achievements" className="text-[11px] font-bold text-primary">{t("Toate insignele")} →</Link>}>{t("Realizările mele")}</SectionTitle><ProgressSummary p={progress} t={t} href="/student/achievements" /></section>}
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
                  <a href={`/invoices/${x.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("Factura PDF")} title={t("Factura PDF")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-soft text-muted hover:text-primary"><FileText className="h-3.5 w-3.5" /></a>
                </div>
              );
            })}
          </Card>
        </section>

      </aside>
    </div>
  );
}

function HomeworkCard({ h, tz, courseTitle, t, open = false, links, folder }: { h: Homework; tz: string; courseTitle?: string; t: T; open?: boolean; links: Record<string, string>; folder?: string }) {
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
      <FileList files={storedFiles(h.attachments)} links={links} className="mt-3" />
      {h.submission && !open && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-soft px-3 py-2 text-[12px] text-ink"><b>{t("Răspunsul tău:")}</b> {h.submission}</p>}
      {!open && <FileList files={storedFiles(h.submission_files)} links={links} className="mt-2" />}
      {h.status === "reviewed" && (h.grade || h.feedback) && (
        <p className="mt-3 rounded-xl bg-[#e7f6ee] px-3 py-2 text-[12px] text-[#11603f]">{h.grade && <b>{t("Nota: {grade}", { grade: h.grade })}. </b>}{h.feedback}</p>
      )}
      {open && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[12px] font-bold text-primary">{t("Predă tema")}</summary>
          <div className="mt-3">
            <ActionForm action={submitHomework} submitLabel={t("Trimite tema")} className="grid gap-3">
              <input type="hidden" name="homework_id" value={h.id} />
              <textarea name="submission" required={!folder} rows={5} maxLength={8000} className="tf-input" placeholder={t("Scrie răspunsul sau lipește un link (Google Docs, Drive etc.)")} defaultValue={h.submission ?? ""} />
              {folder && <FileAttach name="files" folder={folder} initial={storedFiles(h.submission_files)} label={t("Atașează poze sau fișiere")} />}
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  );
}

function ProgressTile({ label, value, sub, ratio }: { label: string; value: string; sub: string; ratio: number | null }) {
  const pct = ratio == null ? null : Math.round(ratio * 100);
  return (
    <Card className="flex items-center gap-4 p-4">
      {pct != null ? (
        <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) ${pct * 3.6}deg, var(--color-tint) 0)` }}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[12px] font-extrabold text-ink">{pct}%</span>
        </span>
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#e7f7ef] text-[#1b8a5a]"><Star className="h-6 w-6" fill="currentColor" /></span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] text-muted">{label}</p>
        <p className="text-[20px] font-extrabold leading-tight">{value}</p>
        <p className="truncate text-[11px] text-muted">{sub}</p>
      </div>
    </Card>
  );
}
