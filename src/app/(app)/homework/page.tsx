import Link from "next/link";
import { CheckCheck, ClipboardList, Pencil, Plus } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, Field, MigrationNotice, PageHeader, Panel, Pill, SubjectIcon, Tabs } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { loadWorkspace } from "@/lib/data/workspace";
import { subjectKind } from "@/lib/data/derive";
import { deleteHomework, markHomeworkSubmitted, reviewHomework, saveHomework } from "@/lib/actions/homework";
import { addDays, dateKey, formatDate } from "@/lib/time";
import type { HomeworkStatus } from "@/types/database";
import { getT } from "@/lib/i18n/server";
import { FileAttach } from "@/components/FileAttach";
import { FileList } from "@/components/FileList";
import { storedFiles } from "@/lib/files";
import { signFiles } from "@/lib/data/files";
import { loadTeacherLibrary } from "@/lib/data/library";

const labels: Record<HomeworkStatus, string> = { assigned: "Atribuită", submitted: "De verificat", reviewed: "Verificată" };
const tones = { assigned: "blue", submitted: "amber", reviewed: "green" } as const;
type Params = { status?: string; new?: string; edit?: string; review?: string; course?: string; student?: string; c?: string; lib?: string };

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const sp = await searchParams;
  const demo = ws.mode === "demo";
  const missing = ws.missingTables.includes("homework");
  const now = new Date();
  const filter = (["submitted", "assigned", "reviewed", "all"] as const).find(f => f === sp.status) ?? "submitted";
  // Optional course filter (?c=<course id>) on top of the status tabs.
  const courseFilter = ws.courses.some(c => c.id === sp.c) ? sp.c : undefined;
  const withC = (q: string) => `/homework?${q}${courseFilter ? `&c=${courseFilter}` : ""}`;
  const inCourse = ws.homework.filter(h => !courseFilter || h.course_id === courseFilter);
  const list = inCourse.filter(h => filter === "all" || h.status === filter);
  const student = new Map(ws.students.map(s => [s.id, s]));
  const course = new Map(ws.courses.map(c => [c.id, c]));
  const count = (st: HomeworkStatus) => ws.homework.filter(h => h.status === st).length;
  const countIn = (st: HomeworkStatus) => inCourse.filter(h => h.status === st).length;
  const editing = sp.edit ? ws.homework.find(h => h.id === sp.edit) : undefined;
  const reviewing = sp.review ? ws.homework.find(h => h.id === sp.review) : undefined;
  const close = withC(`status=${filter}`);
  const today = dateKey(now, ws.timezone);
  const files = ws.mode === "live";
  const lib = files && (sp.new || editing) ? await loadTeacherLibrary() : { ready: false, items: [] };
  const libFiles = lib.items.filter(i => i.kind === "file").sort((a, b) => Number(b.course_id === (editing?.course_id ?? sp.course)) - Number(a.course_id === (editing?.course_id ?? sp.course)));
  const attachedPaths = new Set(storedFiles(editing?.attachments).map(f => f.path));
  const links = files ? await signFiles([...list, ...(reviewing ? [reviewing] : [])].flatMap(h => [...storedFiles(h.attachments), ...storedFiles(h.submission_files)])) : {};

  return (
    <div>
      <PageHeader title={t("Teme")} subtitle={t("{review} de verificat · {open} în lucru", { review: count("submitted"), open: count("assigned") })}
        action={!missing && <Link href="/homework?new=1" className="tf-btn"><Plus className="h-4 w-4" /> {t("Temă nouă")}</Link>} />
      {missing && <MigrationNotice table="homework" />}

      {(sp.new || editing) && !missing && (
        <Panel title={editing ? t("Editează tema") : t("Temă nouă")} closeHref={close}
          aside={editing && <form action={deleteHomework}><input type="hidden" name="id" value={editing.id} /><ConfirmSubmit label={t("Șterge tema")} confirm={t("Confirmă")} className="py-1.5" /></form>}>
          <ActionForm action={saveHomework} demo={demo} submitLabel={editing ? t("Salvează") : t("Atribuie tema")}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label={t("Titlu")} htmlFor="title" wide><input id="title" name="title" required defaultValue={editing?.title} className="tf-input" placeholder={t("ex. Exercițiile 3–7, pagina 42")} /></Field>
            {!editing && (
              <>
                <Field label={t("Pentru tot cursul")} htmlFor="course_id">
                  <select id="course_id" name="course_id" defaultValue={sp.course ?? ""} className="tf-input">
                    <option value="">—</option>
                    {ws.courses.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </Field>
                <Field label={t("…sau pentru un singur elev")} htmlFor="student_id">
                  <select id="student_id" name="student_id" defaultValue={sp.student ?? ""} className="tf-input">
                    <option value="">—</option>
                    {ws.students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label={t("Termen")} htmlFor="due"><input id="due" name="due" type="date" defaultValue={editing?.due_at ? dateKey(new Date(editing.due_at), ws.timezone) : addDays(today, 7)} className="tf-input" /></Field>
            <Field label={t("Descriere")} htmlFor="description" wide><textarea id="description" name="description" rows={3} defaultValue={editing?.description ?? ""} className="tf-input" /></Field>
            {files && ws.userId && <FileAttach name="attachments" folder={`hw/${ws.userId}`} initial={storedFiles(editing?.attachments)} label={t("Atașează fișiere pentru elevi")} />}
            {libFiles.length > 0 && (
              <details className="rounded-[16px] bg-soft p-3.5 sm:col-span-2" open={!!sp.lib}>
                <summary className="cursor-pointer text-[12px] font-bold text-primary-2">{t("Din bibliotecă")} · {libFiles.length}</summary>
                <div className="mt-3 grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {libFiles.map(i => {
                    const path = storedFiles([i.file])[0]?.path;
                    if (!path || attachedPaths.has(path)) return null;
                    return (
                      <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-[12px] font-semibold">
                        <input type="checkbox" name="lib_items" value={i.id} defaultChecked={sp.lib === i.id} className="h-4 w-4 accent-[#5269e8]" />
                        <span className="truncate">{i.title}</span>
                        {i.course_id && <span className="ml-auto shrink-0 text-[10px] text-muted">{course.get(i.course_id)?.title}</span>}
                      </label>
                    );
                  })}
                </div>
              </details>
            )}
          </ActionForm>
        </Panel>
      )}

      {reviewing && (
        <Panel title={t("Verifică · {title}", { title: reviewing.title })} closeHref={close}>
          <p className="mb-4 text-[12px] text-muted">{student.get(reviewing.student_id)?.full_name}{reviewing.submitted_at ? ` · ${t("predată {date}", { date: formatDate(reviewing.submitted_at, ws.timezone, t.locale) })}` : ""}</p>
          {reviewing.submission && (
            <div className="mb-5 rounded-[16px] bg-soft p-4">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t("Răspunsul elevului")}</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{reviewing.submission}</p>
            </div>
          )}
          {storedFiles(reviewing.submission_files).length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">{t("Fișierele elevului")}</p>
              <FileList files={storedFiles(reviewing.submission_files)} links={links} />
            </div>
          )}
          <ActionForm action={reviewHomework} demo={demo} submitLabel={t("Salvează evaluarea")}>
            <input type="hidden" name="id" value={reviewing.id} />
            <Field label={t("Status")} htmlFor="status">
              <select id="status" name="status" defaultValue="reviewed" className="tf-input">
                {(Object.keys(labels) as HomeworkStatus[]).map(s => <option key={s} value={s}>{t(labels[s])}</option>)}
              </select>
            </Field>
            <Field label={t("Notă / calificativ")} htmlFor="grade"><input id="grade" name="grade" maxLength={20} defaultValue={reviewing.grade ?? ""} className="tf-input" placeholder={t("ex. 9 sau Foarte bine")} /></Field>
            <Field label={t("Feedback pentru elev")} htmlFor="feedback" wide><textarea id="feedback" name="feedback" rows={3} defaultValue={reviewing.feedback ?? ""} className="tf-input" /></Field>
          </ActionForm>
        </Panel>
      )}

      {!missing && (
        <Tabs active={filter} items={[
          { key: "submitted", label: t("De verificat"), href: withC("status=submitted"), count: countIn("submitted") },
          { key: "assigned", label: t("În lucru"), href: withC("status=assigned"), count: countIn("assigned") },
          { key: "reviewed", label: t("Verificate"), href: withC("status=reviewed"), count: countIn("reviewed") },
          { key: "all", label: t("Toate"), href: withC("status=all"), count: inCourse.length }
        ]} />
      )}
      {!missing && ws.courses.length > 1 && (
        <div className="tf-scroll -mt-2 mb-5 flex items-center gap-2 overflow-x-auto pb-1 text-[11px] font-bold">
          <span className="shrink-0 text-muted">{t("Curs")}:</span>
          <Link href={`/homework?status=${filter}`} className={`shrink-0 rounded-full px-3 py-2 ${!courseFilter ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}>{t("Toate")}</Link>
          {ws.courses.map(c => (
            <Link key={c.id} href={`/homework?status=${filter}&c=${c.id}`} className={`shrink-0 rounded-full px-3 py-2 ${courseFilter === c.id ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}>{c.title}</Link>
          ))}
        </div>
      )}

      {!missing && list.length === 0 && (
        <EmptyState icon={ClipboardList} title={t("Nicio temă aici")} text={t("Atribuie o temă unui curs întreg sau unui singur elev. Când elevul o predă, o găsești la „De verificat”.")}
          action={<Link href="/homework?new=1" className="tf-btn">{t("Atribuie o temă")}</Link>} />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map(h => {
          const st = student.get(h.student_id);
          const c = h.course_id ? course.get(h.course_id) : undefined;
          const overdue = h.status === "assigned" && h.due_at && new Date(h.due_at) < now;
          return (
            <Card key={h.id} className="p-4">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><SubjectIcon kind={subjectKind(c?.subject ?? null, c?.title ?? h.title)} className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 flex-1 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate font-extrabold text-ink">{h.title}</h4>
                    <Pill tone={overdue ? "red" : tones[h.status]}>{overdue ? t("Întârziată") : t(labels[h.status])}</Pill>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                    <span className="flex items-center gap-1.5"><Avatar name={st?.full_name ?? "?"} src={st?.avatar_url} size={18} />{st?.full_name ?? t("Elev")}</span>
                    {c && <span>{c.title}</span>}
                    {h.due_at && <span>{t("termen {date}", { date: formatDate(h.due_at, ws.timezone, t.locale) })}</span>}
                    {h.grade && <span className="font-bold text-ink">{t("Nota: {grade}", { grade: h.grade })}</span>}
                  </div>
                  {h.description && <p className="mt-2 line-clamp-2 text-muted">{h.description}</p>}
                  <FileList files={storedFiles(h.attachments)} links={links} className="mt-2" />
                  {storedFiles(h.submission_files).length > 0 && (
                    <div className="mt-2">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{t("Predat de elev")}</p>
                      <FileList files={storedFiles(h.submission_files)} links={links} />
                    </div>
                  )}
                  {h.feedback && <p className="mt-2 rounded-xl bg-soft px-3 py-2 text-ink">{h.feedback}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {h.status === "assigned" && (
                      <form action={markHomeworkSubmitted}><input type="hidden" name="id" value={h.id} />
                        <SubmitButton className="inline-flex items-center gap-1.5 rounded-xl bg-tint px-3 py-1.5 font-bold text-primary-2 hover:bg-[#dfe4fb]"><CheckCheck className="h-3.5 w-3.5" /> {t("Predată")}</SubmitButton>
                      </form>
                    )}
                    <Link href={withC(`status=${filter}&review=${h.id}`)} className="inline-flex min-h-9 items-center rounded-xl bg-primary px-3 py-1.5 font-bold text-white hover:bg-primary-2">{h.status === "reviewed" ? t("Editează nota") : t("Verifică")}</Link>
                    <Link href={withC(`status=${filter}&edit=${h.id}`)} aria-label={t("Editează tema")} className="grid h-8 w-8 place-items-center rounded-full bg-soft text-muted hover:text-primary"><Pencil className="h-3.5 w-3.5" /></Link>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
