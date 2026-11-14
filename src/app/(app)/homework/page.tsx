import Link from "next/link";
import { CheckCheck, ClipboardList, Pencil, Plus } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, Field, MigrationNotice, PageHeader, Panel, Pill, SubjectIcon, Tabs } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { loadWorkspace } from "@/lib/data/workspace";
import { subjectKind } from "@/lib/data/derive";
import { deleteHomework, markHomeworkSubmitted, reviewHomework, saveHomework } from "@/lib/actions/homework";
import { addDays, dateKey, formatDate } from "@/lib/time";
import type { HomeworkStatus } from "@/types/database";

const labels: Record<HomeworkStatus, string> = { assigned: "Atribuită", submitted: "De verificat", reviewed: "Verificată" };
const tones = { assigned: "blue", submitted: "amber", reviewed: "green" } as const;
type Params = { status?: string; new?: string; edit?: string; review?: string; course?: string; student?: string };

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ws = await loadWorkspace();
  const sp = await searchParams;
  const demo = ws.mode === "demo";
  const missing = ws.missingTables.includes("homework");
  const now = new Date();
  const filter = (["submitted", "assigned", "reviewed", "all"] as const).find(f => f === sp.status) ?? "submitted";
  const list = ws.homework.filter(h => filter === "all" || h.status === filter);
  const student = new Map(ws.students.map(s => [s.id, s]));
  const course = new Map(ws.courses.map(c => [c.id, c]));
  const count = (st: HomeworkStatus) => ws.homework.filter(h => h.status === st).length;
  const editing = sp.edit ? ws.homework.find(h => h.id === sp.edit) : undefined;
  const reviewing = sp.review ? ws.homework.find(h => h.id === sp.review) : undefined;
  const close = `/homework?status=${filter}`;
  const today = dateKey(now, ws.timezone);

  return (
    <div>
      <PageHeader title="Teme" subtitle={`${count("submitted")} de verificat · ${count("assigned")} în lucru`}
        action={!missing && <Link href="/homework?new=1" className="tf-btn"><Plus className="h-4 w-4" /> Temă nouă</Link>} />
      {missing && <MigrationNotice table="homework" />}

      {(sp.new || editing) && !missing && (
        <Panel title={editing ? "Editează tema" : "Temă nouă"} closeHref={close}>
          <ActionForm action={saveHomework} demo={demo} submitLabel={editing ? "Salvează" : "Atribuie tema"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Titlu" htmlFor="title" wide><input id="title" name="title" required defaultValue={editing?.title} className="tf-input" placeholder="ex. Exercițiile 3–7, pagina 42" /></Field>
            {!editing && (
              <>
                <Field label="Pentru tot cursul" htmlFor="course_id">
                  <select id="course_id" name="course_id" defaultValue={sp.course ?? ""} className="tf-input">
                    <option value="">—</option>
                    {ws.courses.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </Field>
                <Field label="…sau pentru un singur elev" htmlFor="student_id">
                  <select id="student_id" name="student_id" defaultValue={sp.student ?? ""} className="tf-input">
                    <option value="">—</option>
                    {ws.students.filter(s => s.status === "active").map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label="Termen" htmlFor="due"><input id="due" name="due" type="date" defaultValue={editing?.due_at ? dateKey(new Date(editing.due_at), ws.timezone) : addDays(today, 7)} className="tf-input" /></Field>
            <Field label="Descriere" htmlFor="description" wide><textarea id="description" name="description" rows={3} defaultValue={editing?.description ?? ""} className="tf-input" /></Field>
          </ActionForm>
        </Panel>
      )}

      {reviewing && (
        <Panel title={`Verifică · ${reviewing.title}`} closeHref={close}>
          <p className="mb-4 text-[12px] text-muted">{student.get(reviewing.student_id)?.full_name}{reviewing.submitted_at ? ` · predată ${formatDate(reviewing.submitted_at, ws.timezone)}` : ""}</p>
          {reviewing.submission && (
            <div className="mb-5 rounded-[16px] bg-soft p-4">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Răspunsul elevului</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{reviewing.submission}</p>
            </div>
          )}
          <ActionForm action={reviewHomework} demo={demo} submitLabel="Salvează evaluarea">
            <input type="hidden" name="id" value={reviewing.id} />
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" defaultValue="reviewed" className="tf-input">
                {(Object.keys(labels) as HomeworkStatus[]).map(s => <option key={s} value={s}>{labels[s]}</option>)}
              </select>
            </Field>
            <Field label="Notă / calificativ" htmlFor="grade"><input id="grade" name="grade" maxLength={20} defaultValue={reviewing.grade ?? ""} className="tf-input" placeholder="ex. 9 sau Foarte bine" /></Field>
            <Field label="Feedback pentru elev" htmlFor="feedback" wide><textarea id="feedback" name="feedback" rows={3} defaultValue={reviewing.feedback ?? ""} className="tf-input" /></Field>
          </ActionForm>
        </Panel>
      )}

      {!missing && (
        <Tabs active={filter} items={[
          { key: "submitted", label: "De verificat", href: "/homework?status=submitted", count: count("submitted") },
          { key: "assigned", label: "În lucru", href: "/homework?status=assigned", count: count("assigned") },
          { key: "reviewed", label: "Verificate", href: "/homework?status=reviewed", count: count("reviewed") },
          { key: "all", label: "Toate", href: "/homework?status=all", count: ws.homework.length }
        ]} />
      )}

      {!missing && list.length === 0 && (
        <EmptyState icon={ClipboardList} title="Nicio temă aici" text="Atribuie o temă unui curs întreg sau unui singur elev. Când elevul o predă, o găsești la „De verificat”."
          action={<Link href="/homework?new=1" className="tf-btn">Atribuie o temă</Link>} />
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
                    <Pill tone={overdue ? "red" : tones[h.status]}>{overdue ? "Întârziată" : labels[h.status]}</Pill>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                    <span className="flex items-center gap-1.5"><Avatar name={st?.full_name ?? "?"} size={18} />{st?.full_name ?? "Elev"}</span>
                    {c && <span>{c.title}</span>}
                    {h.due_at && <span>termen {formatDate(h.due_at, ws.timezone)}</span>}
                    {h.grade && <span className="font-bold text-ink">Nota: {h.grade}</span>}
                  </div>
                  {h.description && <p className="mt-2 line-clamp-2 text-muted">{h.description}</p>}
                  {h.feedback && <p className="mt-2 rounded-xl bg-soft px-3 py-2 text-ink">{h.feedback}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {h.status === "assigned" && (
                      <form action={markHomeworkSubmitted}><input type="hidden" name="id" value={h.id} />
                        <SubmitButton className="inline-flex items-center gap-1.5 rounded-xl bg-tint px-3 py-1.5 font-bold text-primary-2 hover:bg-[#dfe4fb]"><CheckCheck className="h-3.5 w-3.5" /> Predată</SubmitButton>
                      </form>
                    )}
                    <Link href={`/homework?status=${filter}&review=${h.id}`} className="rounded-xl bg-primary px-3 py-1.5 font-bold text-white hover:bg-primary-2">{h.status === "reviewed" ? "Editează nota" : "Verifică"}</Link>
                    <Link href={`/homework?status=${filter}&edit=${h.id}`} aria-label="Editează tema" className="grid h-8 w-8 place-items-center rounded-full bg-soft text-muted hover:text-primary"><Pencil className="h-3.5 w-3.5" /></Link>
                    <form action={deleteHomework} className="ml-auto"><input type="hidden" name="id" value={h.id} /><ConfirmSubmit label="Șterge" confirm="Confirmă" className="py-1.5" /></form>
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
