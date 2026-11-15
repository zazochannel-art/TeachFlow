import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Award, BarChart3, CircleCheck, Clock3, Flag, Link2, Pencil, Plus, RotateCcw, Send, Target, Trash2, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Avatar, Card, Field, PageHeader, Pill, Tabs } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PendingMigration } from "@/components/PendingMigration";
import { AnswerView } from "@/components/quiz/AnswerView";
import { OpenGrading } from "@/components/quiz/OpenGrading";
import { CopyLink, PreviewButton } from "@/components/quiz/SmallClient";
import { loadWorkspace } from "@/lib/data/workspace";
import { loadQuizDetail } from "@/lib/data/quizzes";
import { signPaths } from "@/lib/data/files";
import { grantQuizAttempt, publishQuiz, removeQuizAssignment, resetQuizAssignment, setQuizStatus } from "@/lib/actions/quizzes";
import { STATUS_LABEL, STATUS_TONE, durationLabel, percent, quizStats, toPublic, totalPoints } from "@/lib/quiz";
import { aiConfigured } from "@/lib/ai/claude";
import { formatDate, formatTime, localInputValue } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import type { QuizAttempt } from "@/types/database";

type Params = { tab?: string; a?: string; t?: string; published?: string };
const tone = (p: number | null) => (p == null ? "gray" : p >= 80 ? "green" : p >= 50 ? "amber" : "red") as "gray" | "green" | "amber" | "red";

/** One test: results and statistics, publishing, and the questions with their answer key. */
export default async function QuizDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [ws, data, t] = await Promise.all([loadWorkspace(), loadQuizDetail(id), getT()]);
  if (!data.ready) return <PendingMigration file="0014" />;
  if (!data.quiz) notFound();
  const quiz = data.quiz;
  const tz = ws.timezone;
  const tab = sp.tab === "publish" || sp.tab === "questions" ? sp.tab : "results";
  const student = new Map(ws.students.map(s => [s.id, s]));
  const course = new Map(ws.courses.map(c => [c.id, c]));
  const attemptsOf = (aid: string) => data.attempts.filter(x => x.assignment_id === aid);
  const lastOf = (aid: string, lastId: string | null) => data.attempts.find(x => x.id === lastId) ?? null;
  const running = (aid: string) => data.attempts.find(x => x.assignment_id === aid && x.status === "in_progress");
  const lastAttempts = data.assignments.map(a => lastOf(a.id, a.last_attempt_id)).filter((x): x is QuizAttempt => !!x && x.status === "submitted");
  const stats = quizStats(quiz.questions, lastAttempts, quiz.pass_percent);
  const openA = sp.a ? data.assignments.find(a => a.id === sp.a) : undefined;
  const openAttempts = openA ? attemptsOf(openA.id).filter(x => x.status === "submitted") : [];
  const openT = openA ? openAttempts.find(x => x.id === sp.t) ?? openAttempts.find(x => x.id === openA.last_attempt_id) ?? openAttempts.at(-1) : undefined;
  const images = await signPaths([...quiz.questions, ...(openT?.questions ?? [])].map(q => q.image));
  const h = await headers();
  const appUrl = (process.env.APP_URL || `https://${h.get("host") ?? ""}`).replace(/\/$/, "");
  const shareUrl = quiz.share_code ? `${appUrl}/student/quizzes/open/${quiz.share_code}` : null;
  const base = `/quizzes/${quiz.id}`;
  const first = data.assignments[0];
  const counts = (x: QuizAttempt) => {
    let right = 0, wrong = 0, pending = 0;
    for (const q of x.questions) {
      if (!(q.id in x.question_scores)) pending++;
      else if (x.question_scores[q.id] >= q.points && q.points > 0) right++;
      else wrong++;
    }
    return { right, wrong, pending };
  };

  return (
    <div>
      <Link href="/quizzes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {t("Teste AI")}</Link>
      <PageHeader title={quiz.title}
        subtitle={[quiz.subject, quiz.level, quiz.course_id ? course.get(quiz.course_id)?.title : null, t.n("{n} întrebare|{n} întrebări|{n} de întrebări", quiz.questions.length), t("total {n} p", { n: totalPoints(quiz.questions) }), quiz.time_limit_min ? t("{n} min", { n: quiz.time_limit_min }) : null].filter(Boolean).join(" · ")}
        action={<span className="flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONE[quiz.status]}>{t(STATUS_LABEL[quiz.status])}{quiz.version > 1 ? ` · v${quiz.version}` : ""}</Pill>
          <Link href={`${base}/edit`} className="tf-btn-ghost px-3 py-2 text-[12px]"><Pencil className="h-3.5 w-3.5" /> {t("Editează")}</Link>
          <Link href={`${base}?tab=publish`} className="tf-btn px-3 py-2 text-[12px]"><Send className="h-3.5 w-3.5" /> {t("Publică")}</Link>
        </span>} />
      {sp.published && <p role="status" className="mb-4 rounded-xl bg-[#e7f7ef] p-3 text-[12px] font-semibold text-[#11603f]">{Number(sp.published) > 0 ? t.n("Testul a fost trimis la {n} elev nou.|Testul a fost trimis la {n} elevi noi.|Testul a fost trimis la {n} de elevi noi.", Number(sp.published)) : t("Setările au fost actualizate.")}</p>}

      <Tabs active={tab} items={[
        { key: "results", label: t("Rezultate"), href: base, count: stats.submitted },
        { key: "publish", label: t("Publicare"), href: `${base}?tab=publish`, count: data.assignments.length },
        { key: "questions", label: t("Întrebări"), href: `${base}?tab=questions`, count: quiz.questions.length }
      ]} />

      {tab === "results" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { icon: Users, label: t("Au rezolvat"), value: `${stats.submitted}/${data.assignments.length}` },
              { icon: BarChart3, label: t("Media grupei"), value: stats.average != null ? `${stats.average}%` : "—" },
              { icon: TrendingUp, label: t("Cea mai mare notă"), value: stats.best != null ? `${stats.best}%` : "—" },
              { icon: TrendingDown, label: t("Cea mai mică notă"), value: stats.worst != null ? `${stats.worst}%` : "—" },
              { icon: Target, label: t("Rata de promovare"), value: stats.passRate != null ? `${stats.passRate}%` : "—", hint: t("prag {n}%", { n: quiz.pass_percent }) },
              { icon: AlertTriangle, label: t("De verificat manual"), value: String(stats.toReview) }
            ].map(c => (
              <Card key={c.label} className="p-4">
                <c.icon className="h-4 w-4 text-primary" />
                <p className="mt-2 text-[20px] font-extrabold text-ink">{c.value}</p>
                <p className="text-[11px] font-bold text-muted">{c.label}{c.hint ? ` · ${c.hint}` : ""}</p>
              </Card>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[13px] font-extrabold text-ink">{t("Elevi")}</p>
                {!data.assignments.length && <Link href={`${base}?tab=publish`} className="text-[12px] font-bold text-primary">{t("Publică testul")} →</Link>}
              </div>
              {!data.assignments.length && <p className="p-5 text-[12px] text-muted">{t("Testul nu a fost dat încă niciunui elev.")}</p>}
              <div className="divide-y divide-line">
                {data.assignments.map(a => {
                  const s = student.get(a.student_id);
                  const last = lastOf(a.id, a.last_attempt_id);
                  const run = running(a.id);
                  const p = percent(a.score, a.max_score);
                  const late = a.status === "assigned" && a.due_at && new Date(a.due_at) < new Date();
                  const c = last && last.status === "submitted" ? counts(last) : null;
                  return (
                    <div key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${openA?.id === a.id ? "bg-soft" : ""}`}>
                      <Avatar name={s?.full_name ?? "?"} src={s?.avatar_url} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-extrabold">{s?.full_name ?? t("Elev")}</p>
                        <p className="flex flex-wrap gap-x-3 text-[11px] text-muted">
                          {a.status === "submitted" && a.submitted_at ? <span>{t("trimis {date}", { date: `${formatDate(a.submitted_at, tz, t.locale)}, ${formatTime(a.submitted_at, tz, t.locale)}` })}</span> : a.due_at ? <span>{t("termen {date}", { date: formatDate(a.due_at, tz, t.locale) })}</span> : <span>{t("fără termen")}</span>}
                          {a.time_spent_sec != null && <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> {durationLabel(a.time_spent_sec)}</span>}
                          {c && <span><span className="font-bold text-[#1b8a5a]">✓ {c.right}</span> · <span className="font-bold text-[#c03a3a]">✗ {c.wrong}</span>{c.pending ? ` · ? ${c.pending}` : ""}</span>}
                          <span>{t("încercări {used}/{max}", { used: a.attempts_used, max: a.max_attempts })}</span>
                        </p>
                      </div>
                      {a.needs_review && <Pill tone="amber">{t("De verificat")}</Pill>}
                      {run ? <Pill tone="blue">{t("În lucru")}</Pill> : a.status === "submitted"
                        ? <Pill tone={tone(p)}>{`${a.score}/${a.max_score} · ${p}%`}</Pill>
                        : <Pill tone={late ? "red" : "gray"}>{late ? t("Întârziat") : t("Nerezolvat")}</Pill>}
                      <span className="flex items-center gap-0.5">
                        {a.status === "submitted" && <Link href={`${base}?a=${a.id}#student`} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-primary-2 hover:bg-white">{t("Vezi")}</Link>}
                        {a.status === "submitted" && a.attempts_used >= a.max_attempts && (
                          <form action={grantQuizAttempt}><input type="hidden" name="id" value={a.id} />
                            <SubmitButton className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white hover:text-ink"><Plus className="h-3.5 w-3.5" aria-label={t("Încă o încercare")} /></SubmitButton>
                          </form>
                        )}
                        {(a.status === "submitted" || run) && (
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
            </Card>

            <Card className="p-4">
              <p className="mb-1 text-[13px] font-extrabold text-ink">{t("Cele mai dificile întrebări")}</p>
              <p className="mb-3 text-[11px] text-muted">{t("Procentul elevilor care au răspuns corect.")}</p>
              {stats.submitted === 0 ? <p className="text-[12px] text-muted">{t("Statisticile apar după primele rezultate.")}</p> : (
                <ol className="space-y-2.5">
                  {stats.questions.filter(q => q.rate != null).slice(0, 8).map(q => {
                    const n = quiz.questions.findIndex(x => x.id === q.id) + 1;
                    return (
                      <li key={q.id}>
                        <div className="flex items-start gap-2 text-[12px]">
                          <span className="font-extrabold text-primary-2">{n}.</span>
                          <span className="line-clamp-2 min-w-0 flex-1 text-ink">{q.text}</span>
                          <span className={`shrink-0 font-extrabold ${q.rate! < 50 ? "text-[#c03a3a]" : "text-ink"}`}>{q.rate}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft"><div className={`h-full rounded-full ${q.rate! < 50 ? "bg-[#e05656]" : q.rate! < 80 ? "bg-[#e3a23a]" : "bg-[#2fa66f]"}`} style={{ width: `${q.rate}%` }} /></div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>

          {openA && openT && (
            <div id="student" className="mt-6 scroll-mt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-extrabold text-ink">{t("Răspunsurile lui {name}", { name: student.get(openA.student_id)?.full_name ?? t("Elev") })}</p>
                <Pill tone={tone(percent(openT.score, openT.max_score))}>{`${openT.score}/${openT.max_score} · ${percent(openT.score, openT.max_score)}%`}</Pill>
                {openAttempts.length > 1 && (
                  <span className="flex gap-1">
                    {openAttempts.map(x => <Link key={x.id} href={`${base}?a=${openA.id}&t=${x.id}#student`} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${x.id === openT.id ? "bg-primary text-white" : "bg-white text-muted shadow-card"}`}>{t("Încercarea {n}", { n: x.attempt_no })}</Link>)}
                  </span>
                )}
                <Link href={base} className="ml-auto text-[12px] font-bold text-muted hover:text-ink">{t("Închide")}</Link>
              </div>
              {openT.questions.some(q => q.type === "open") && (
                <div className="mb-4">
                  <OpenGrading key={openT.id} attemptId={openT.id} questions={openT.questions} answers={openT.answers} scores={openT.manual_scores} feedback={openT.feedback} aiReady={aiConfigured()}
                    context={{ title: quiz.title, subject: quiz.subject, level: quiz.level, language: quiz.language, topic: quiz.topic }} />
                </div>
              )}
              <AnswerView questions={openT.questions} answers={openT.answers} scores={openT.question_scores} feedback={openT.feedback} reveal images={images} />
            </div>
          )}
        </>
      )}

      {tab === "publish" && (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-1 text-[15px] font-extrabold text-ink">{t("Atribuie testul")}</h2>
            <p className="mb-4 text-[12px] text-muted">{t("Elevii primesc o notificare și găsesc testul în portal, la „Teste”. Pentru cei care au deja testul se actualizează doar setările.")}</p>
            {!quiz.questions.length ? <p className="rounded-xl bg-[#fff8e8] p-3 text-[12px] text-[#7a5410]">{t("Adaugă cel puțin o întrebare.")}</p> : (
              <ActionForm action={publishQuiz} demo={ws.mode === "demo"} submitLabel={t("Publică testul")}>
                <input type="hidden" name="quiz_id" value={quiz.id} />
                <Field label={t("Toată grupa / cursul")} htmlFor="course_id">
                  <select id="course_id" name="course_id" defaultValue={quiz.course_id ?? ""} className="tf-input">
                    <option value="">—</option>
                    {ws.courses.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </Field>
                <div>
                  <span className="tf-label">{t("…și/sau elevi individuali")}</span>
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                    {ws.students.filter(s => s.status === "active").map(s => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-soft">
                        <input type="checkbox" name="student_ids" value={s.id} defaultChecked={data.assignments.some(a => a.student_id === s.id)} className="h-4 w-4 accent-[#5269e8]" /> {s.full_name}
                      </label>
                    ))}
                    {!ws.students.some(s => s.status === "active") && <p className="px-2 py-1 text-[12px] text-muted">{t("Nu ai elevi activi.")}</p>}
                  </div>
                </div>
                <Field label={t("Începe la (opțional)")} htmlFor="starts"><input id="starts" name="starts" type="datetime-local" defaultValue={localInputValue(first?.starts_at, tz)} className="tf-input" /></Field>
                <Field label={t("Termen-limită (opțional)")} htmlFor="due"><input id="due" name="due" type="datetime-local" defaultValue={localInputValue(first?.due_at, tz)} className="tf-input" /></Field>
                <Field label={t("Durata testului (minute)")} htmlFor="time_limit_min"><input id="time_limit_min" name="time_limit_min" type="number" min={1} max={240} defaultValue={first?.time_limit_min ?? quiz.time_limit_min ?? ""} className="tf-input" placeholder={t("fără limită")} /></Field>
                <Field label={t("Încercări permise")} htmlFor="max_attempts"><input id="max_attempts" name="max_attempts" type="number" min={1} max={20} defaultValue={first?.max_attempts ?? quiz.max_attempts} className="tf-input" /></Field>
                <Field label={t("Răspunsurile corecte")} htmlFor="show_answers">
                  <select id="show_answers" name="show_answers" defaultValue={first?.show_answers ?? quiz.show_answers} className="tf-input">
                    <option value="after_submit">{t("Afișează după finalizare")}</option>
                    <option value="after_due">{t("Afișează după termen")}</option>
                    <option value="never">{t("Nu le afișa")}</option>
                  </select>
                </Field>
                <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-[12px] font-bold text-ink">
                  <input type="checkbox" name="shuffle" defaultChecked={first?.shuffle ?? quiz.shuffle} className="h-4 w-4 accent-[#5269e8]" /> {t("Ordine aleatorie a întrebărilor")}
                </label>
                <p className="text-[11px] text-muted sm:col-span-2">{t("Cu mai multe încercări, răspunsurile corecte apar după ultima încercare sau după termen.")}</p>
              </ActionForm>
            )}
          </Card>
          <div className="space-y-5">
            <Card className="p-5">
              <p className="mb-1 flex items-center gap-2 text-[13px] font-extrabold text-ink"><Link2 className="h-4 w-4 text-primary" /> {t("Linkul testului")}</p>
              {shareUrl ? (
                <>
                  <p className="mb-3 text-[12px] text-muted">{t("Trimite linkul elevilor cărora le-ai atribuit testul. Se deschide după autentificare în portalul elevului.")}</p>
                  <CopyLink url={shareUrl} />
                </>
              ) : <p className="text-[12px] text-muted">{t("Linkul apare după prima publicare.")}</p>}
            </Card>
            <Card className="p-5">
              <p className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-ink"><Flag className="h-4 w-4 text-primary" /> {t("Starea testului")}</p>
              <p className="mb-3 text-[12px] text-muted">{t("Un test finalizat nu mai poate fi început de elevi; rezultatele rămân.")}</p>
              <form action={setQuizStatus}>
                <input type="hidden" name="id" value={quiz.id} />
                <input type="hidden" name="status" value={quiz.status === "finished" ? "published" : "finished"} />
                <SubmitButton className="tf-btn-ghost">{quiz.status === "finished" ? <><RotateCcw className="h-4 w-4" /> {t("Redeschide testul")}</> : <><CircleCheck className="h-4 w-4" /> {t("Finalizează testul")}</>}</SubmitButton>
              </form>
            </Card>
          </div>
        </div>
      )}

      {tab === "questions" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <PreviewButton title={quiz.title} instructions={quiz.description} questions={quiz.questions.map(q => toPublic(q))} images={images} minutes={quiz.time_limit_min} />
            <Link href={`${base}/edit`} className="tf-btn-ghost px-3 py-1.5 text-[12px]"><Pencil className="h-3.5 w-3.5" /> {t("Editează întrebările")}</Link>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-muted"><Award className="h-3.5 w-3.5" /> {t("prag {n}%", { n: quiz.pass_percent })}</span>
          </div>
          <AnswerView questions={quiz.questions} answers={{}} scores={Object.fromEntries(quiz.questions.map(q => [q.id, q.points]))} reveal images={images} />
        </>
      )}
    </div>
  );
}
