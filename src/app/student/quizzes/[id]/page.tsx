import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { QuizReview } from "@/components/QuizReview";
import { createClient } from "@/lib/supabase/server";
import { loadStudentPortal } from "@/lib/data/student";
import { submitQuiz } from "@/lib/actions/quizzes";
import { percent, storedQuestions } from "@/lib/quiz";
import { formatDate } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

/** Take a quiz, or see the corrected answers once it was handed in. */
export default async function StudentQuiz({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, p, t] = await Promise.all([params, loadStudentPortal(), getT()]);
  const supabase = await createClient();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: rows }, { data: a }] = await Promise.all([
    supabase.rpc("quiz_for_student", { p_assignment_id: id }),
    supabase.from("quiz_assignments").select("status, answers, correct_ids, score, max_score, submitted_at").eq("id", id).maybeSingle()
  ]);
  const quiz = Array.isArray(rows) ? rows[0] : null;
  if (!quiz || !a) notFound();
  const questions = storedQuestions(quiz.questions);
  const done = a.status === "submitted";
  const pc = percent(a.score, a.max_score);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/student/quizzes" className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {t("Teste")}</Link>
      <h1 className="text-[24px] font-extrabold tracking-tight">{quiz.title}</h1>
      <p className="mt-1 text-[13px] text-muted">
        {[t.n("{n} întrebare|{n} întrebări|{n} de întrebări", questions.length), quiz.due_at && !done ? t("termen {date}", { date: formatDate(quiz.due_at, p.timezone, t.locale) }) : null].filter(Boolean).join(" · ")}
      </p>
      {quiz.description && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-soft p-3 text-[13px] text-ink">{quiz.description}</p>}

      {done ? (
        <>
          <Card className="mt-6 flex items-center gap-4 p-5">
            <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-[18px] font-extrabold text-white ${pc != null && pc >= 80 ? "bg-[#1b8a5a]" : pc != null && pc >= 50 ? "bg-[#d38b12]" : "bg-[#c03a3a]"}`}>{pc}%</span>
            <div>
              <p className="text-[18px] font-extrabold">{t("Ai obținut {score} din {max} puncte", { score: Number(a.score), max: Number(a.max_score) })}</p>
              {a.submitted_at && <p className="text-[12px] text-muted">{t("trimis {date}", { date: formatDate(a.submitted_at, p.timezone, t.locale) })}</p>}
            </div>
          </Card>
          <div className="mt-6"><QuizReview questions={questions} answers={a.answers as Record<string, unknown> | null} correctIds={Array.isArray(a.correct_ids) ? a.correct_ids.map(String) : []} /></div>
        </>
      ) : (
        <Card className="mt-6 p-5">
          <ActionForm action={submitQuiz} demo={p.mode === "demo"} submitLabel={t("Trimite răspunsurile")} className="grid gap-5">
            <input type="hidden" name="assignment_id" value={id} />
            {questions.map((q, i) => (
              <fieldset key={q.id} className="rounded-[18px] border border-line p-4">
                <legend className="px-1 text-[11px] font-bold text-muted">{t("Întrebarea {n}", { n: i + 1 })} · {t.n("{n} punct|{n} puncte|{n} de puncte", q.points)}</legend>
                <p className="whitespace-pre-wrap text-[14px] font-bold text-ink">{q.text}</p>
                {q.type === "short" ? (
                  <input name={`q_${q.id}`} maxLength={500} autoComplete="off" className="tf-input mt-3" placeholder={t("Răspunsul tău")} aria-label={t("Răspunsul tău")} />
                ) : (
                  <div className="mt-3 space-y-2">
                    {q.type === "multi" && <p className="text-[11px] text-muted">{t("Pot fi mai multe răspunsuri corecte.")}</p>}
                    {q.options.map((o, n) => (
                      <label key={n} className="flex cursor-pointer items-center gap-3 rounded-xl bg-soft px-3.5 py-2.5 text-[13px] has-[:checked]:bg-tint has-[:checked]:font-bold">
                        <input type={q.type === "multi" ? "checkbox" : "radio"} name={`q_${q.id}`} value={n} className="h-4 w-4 accent-[#5269e8]" />
                        <span>{o}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            ))}
            <p className="text-[11px] text-muted">{t("Verifică răspunsurile: după trimitere nu le mai poți schimba.")}</p>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
