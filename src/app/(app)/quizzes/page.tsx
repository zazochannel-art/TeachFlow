import Link from "next/link";
import { ListChecks, Pencil, Plus, RotateCcw, Send, Trash2, Users } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, Field, PageHeader, Panel, Pill } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { QuizEditor } from "@/components/QuizEditor";
import { QuizReview } from "@/components/QuizReview";
import { PendingMigration } from "@/components/PendingMigration";
import { loadWorkspace } from "@/lib/data/workspace";
import { loadTeacherQuizzes } from "@/lib/data/quizzes";
import { assignQuiz, deleteQuiz, removeQuizAssignment, resetQuizAssignment, saveQuiz } from "@/lib/actions/quizzes";
import { percent } from "@/lib/quiz";
import { addDays, dateKey, formatDate } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

type Params = { new?: string; edit?: string; assign?: string; view?: string; a?: string; course?: string; student?: string };

const tone = (p: number | null) => (p == null ? "gray" : p >= 80 ? "green" : p >= 50 ? "amber" : "red") as "gray" | "green" | "amber" | "red";

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, data, t, sp] = await Promise.all([loadWorkspace(), loadTeacherQuizzes(), getT(), searchParams]);
  const demo = ws.mode === "demo";
  const today = dateKey(new Date(), ws.timezone);
  const student = new Map(ws.students.map(s => [s.id, s]));
  const course = new Map(ws.courses.map(c => [c.id, c]));
  const editing = sp.edit ? data.quizzes.find(q => q.id === sp.edit) : undefined;
  const assigning = sp.assign ? data.quizzes.find(q => q.id === sp.assign) : undefined;
  const viewing = sp.view ? data.quizzes.find(q => q.id === sp.view) : undefined;
  const of = (quizId: string) => data.assignments.filter(a => a.quiz_id === quizId);
  const avg = (quizId: string) => {
    const done = of(quizId).filter(a => a.status === "submitted" && a.max_score);
    return done.length ? Math.round(done.reduce((s, a) => s + (percent(a.score, a.max_score) ?? 0), 0) / done.length) : null;
  };
  const pts = (qs: { points: number }[]) => qs.reduce((s, q) => s + q.points, 0);
  const openA = viewing && sp.a ? of(viewing.id).find(a => a.id === sp.a) : undefined;

  return (
    <div>
      <PageHeader title={t("Teste")} subtitle={t("Teste cu notare automată: elevii răspund în portal, nota apare imediat.")}
        action={data.ready && <Link href="/quizzes?new=1" className="tf-btn"><Plus className="h-4 w-4" /> {t("Test nou")}</Link>} />
      {!data.ready && <PendingMigration />}

      {data.ready && (sp.new || editing) && (
        <Panel title={editing ? t("Editează testul") : t("Test nou")} closeHref={editing ? `/quizzes?view=${editing.id}` : "/quizzes"}
          aside={editing && <form action={deleteQuiz}><input type="hidden" name="id" value={editing.id} /><ConfirmSubmit label={t("Șterge testul")} confirm={t("Confirmă")} className="py-1.5" /></form>}>
          {editing && of(editing.id).some(a => a.status === "submitted") && (
            <p className="mb-4 rounded-xl bg-[#fff8e8] p-3 text-[12px] text-[#7a5410]">{t("Rezultatele deja trimise rămân neschimbate; modificările se aplică elevilor care încă nu au răspuns.")}</p>
          )}
          <ActionForm action={saveQuiz} demo={demo} submitLabel={editing ? t("Salvează") : t("Salvează și dă-l elevilor")}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label={t("Titlu")} htmlFor="title" wide><input id="title" name="title" required maxLength={160} defaultValue={editing?.title} className="tf-input" placeholder={t("ex. Test · Present Simple")} /></Field>
            <Field label={t("Curs")} htmlFor="course_id">
              <select id="course_id" name="course_id" defaultValue={editing?.course_id ?? sp.course ?? ""} className="tf-input">
                <option value="">—</option>
                {ws.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <Field label={t("Instrucțiuni (opțional)")} htmlFor="description"><input id="description" name="description" maxLength={2000} defaultValue={editing?.description ?? ""} className="tf-input" placeholder={t("ex. Ai 20 de minute. Nu folosi dicționarul.")} /></Field>
            <QuizEditor initial={editing?.questions ?? []} />
          </ActionForm>
        </Panel>
      )}

      {data.ready && assigning && (
        <Panel title={t("Dă testul · {title}", { title: assigning.title })} closeHref={`/quizzes?view=${assigning.id}`}>
          <ActionForm action={assignQuiz} demo={demo} submitLabel={t("Trimite elevilor")}>
            <input type="hidden" name="quiz_id" value={assigning.id} />
            <Field label={t("Pentru tot cursul")} htmlFor="course_id">
              <select id="course_id" name="course_id" defaultValue={sp.course ?? assigning.course_id ?? ""} className="tf-input">
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
            <Field label={t("Termen")} htmlFor="due"><input id="due" name="due" type="date" defaultValue={addDays(today, 7)} className="tf-input" /></Field>
            <p className="self-end text-[11px] text-muted">{t("Elevii primesc o notificare și găsesc testul în portal, la „Teste”.")}</p>
          </ActionForm>
        </Panel>
      )}

      {data.ready && viewing && (
        <Panel title={viewing.title} closeHref="/quizzes"
          aside={<>
            <Link href={`/quizzes?edit=${viewing.id}`} className="tf-btn-ghost px-3 py-1.5 text-[12px]"><Pencil className="h-3.5 w-3.5" /> {t("Editează")}</Link>
            <Link href={`/quizzes?assign=${viewing.id}`} className="tf-btn px-3 py-1.5 text-[12px]"><Send className="h-3.5 w-3.5" /> {t("Dă testul")}</Link>
          </>}>
          <p className="mb-4 text-[12px] text-muted">
            {[viewing.course_id ? course.get(viewing.course_id)?.title : null, t.n("{n} întrebare|{n} întrebări|{n} de întrebări", viewing.questions.length), t.n("{n} punct|{n} puncte|{n} de puncte", pts(viewing.questions))].filter(Boolean).join(" · ")}
          </p>
          {of(viewing.id).length === 0 ? (
            <p className="rounded-xl bg-soft p-4 text-[12px] text-muted">{t("Testul nu a fost dat încă niciunui elev.")} <Link href={`/quizzes?assign=${viewing.id}`} className="font-bold text-primary">{t("Dă testul")} →</Link></p>
          ) : (
            <div className="divide-y divide-line rounded-[18px] border border-line">
              {of(viewing.id).map(a => {
                const s = student.get(a.student_id);
                const p = percent(a.score, a.max_score);
                const late = a.status === "assigned" && a.due_at && new Date(a.due_at) < new Date();
                return (
                  <div key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${openA?.id === a.id ? "bg-soft" : ""}`}>
                    <Avatar name={s?.full_name ?? "?"} src={s?.avatar_url} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold">{s?.full_name ?? t("Elev")}</p>
                      <p className="text-[11px] text-muted">
                        {a.status === "submitted" && a.submitted_at ? t("trimis {date}", { date: formatDate(a.submitted_at, ws.timezone, t.locale) }) : a.due_at ? t("termen {date}", { date: formatDate(a.due_at, ws.timezone, t.locale) }) : t("fără termen")}
                      </p>
                    </div>
                    {a.status === "submitted"
                      ? <Pill tone={tone(p)}>{`${a.score}/${a.max_score} · ${p}%`}</Pill>
                      : <Pill tone={late ? "red" : "blue"}>{late ? t("Întârziat") : t("Nerezolvat")}</Pill>}
                    <span className="flex items-center gap-1">
                      {a.status === "submitted" && <Link href={`/quizzes?view=${viewing.id}&a=${a.id}`} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-primary-2 hover:bg-white">{t("Răspunsuri")}</Link>}
                      {a.status === "submitted" && (
                        <form action={resetQuizAssignment}><input type="hidden" name="id" value={a.id} />
                          <SubmitButton className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white hover:text-ink"><RotateCcw className="h-3.5 w-3.5" aria-label={t("Permite refacerea")} /></SubmitButton>
                        </form>
                      )}
                      <form action={removeQuizAssignment}><input type="hidden" name="id" value={a.id} />
                        <SubmitButton className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#fdecec] hover:text-[#c03a3a]"><Trash2 className="h-3.5 w-3.5" aria-label={t("Retrage testul")} /></SubmitButton>
                      </form>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {openA?.questions && (
            <div className="mt-5">
              <p className="mb-3 text-[12px] font-extrabold text-ink">{t("Răspunsurile lui {name}", { name: student.get(openA.student_id)?.full_name ?? t("Elev") })}</p>
              <QuizReview questions={openA.questions} answers={openA.answers} correctIds={openA.correct_ids ?? []} />
            </div>
          )}
        </Panel>
      )}

      {data.ready && data.quizzes.length === 0 && !sp.new && (
        <EmptyState icon={ListChecks} title={t("Niciun test încă")}
          text={t("Creează un test cu variante sau răspunsuri scurte. Elevii îl rezolvă în portal, iar TeachFlow calculează nota automat.")}
          action={<Link href="/quizzes?new=1" className="tf-btn">{t("Creează primul test")}</Link>} />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.quizzes.map(q => {
          const list = of(q.id);
          const done = list.filter(a => a.status === "submitted").length;
          const a = avg(q.id);
          return (
            <Link key={q.id} href={`/quizzes?view=${q.id}`} className="block">
              <Card className={`h-full p-4 transition-colors hover:bg-soft ${viewing?.id === q.id ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><ListChecks className="h-[18px] w-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[13px] font-extrabold text-ink">{q.title}</h4>
                    <p className="mt-0.5 truncate text-[11px] text-muted">{[q.course_id ? course.get(q.course_id)?.title : null, t.n("{n} întrebare|{n} întrebări|{n} de întrebări", q.questions.length)].filter(Boolean).join(" · ")}</p>
                  </div>
                  {a != null && <Pill tone={tone(a)}>{t("media {n}%", { n: a })}</Pill>}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-muted"><Users className="h-3.5 w-3.5" /> {list.length ? t("{done} din {total} au rezolvat", { done, total: list.length }) : t("Nedat încă")}</p>
              </Card>
            </Link>
          );
        })}
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
