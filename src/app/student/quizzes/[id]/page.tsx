import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Clock3, ListChecks, RotateCcw, Timer } from "lucide-react";
import { Card } from "@/components/ui";
import { PendingMigration } from "@/components/PendingMigration";
import { QuizPlayer } from "@/components/quiz/QuizPlayer";
import { AnswerView } from "@/components/quiz/AnswerView";
import { StartQuizButton } from "@/components/quiz/SmallClient";
import { createClient } from "@/lib/supabase/server";
import { loadStudentPortal } from "@/lib/data/student";
import { signPaths } from "@/lib/data/files";
import { percent, publicQuestions, storedQuestions } from "@/lib/quiz";
import { formatDate, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

type Row = {
  title: string; description: string | null; due_at: string | null; starts_at: string | null; status: string;
  time_limit_min: number | null; max_attempts: number; attempts_used: number; show_answers: string;
  score: number | null; max_score: number | null; needs_review: boolean; submitted_at: string | null; pass_percent: number;
  question_count: number; total_points: number; quiz_state: string;
  attempt_id: string | null; deadline_at: string | null; questions: unknown; draft: Record<string, unknown> | null;
};
type Review = { questions: unknown; answers: Record<string, unknown> | null; scores: Record<string, number> | null; feedback: Record<string, string> | null; reveal: boolean; attempt_no: number };

/** The student's test: start screen, the running test, or the result with the corrected answers. */
export default async function StudentQuiz({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, p, t] = await Promise.all([params, loadStudentPortal(), getT()]);
  const supabase = await createClient();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: rows, error } = await supabase.rpc("quiz_for_student", { p_assignment_id: id });
  if (error && /quiz_state|does not exist|function/i.test(error.message)) return <PendingMigration file="0014" />;
  const quiz = (Array.isArray(rows) ? rows[0] : null) as Row | null;
  if (!quiz) notFound();
  const tz = p.timezone;
  const when = (iso: string) => `${formatDate(iso, tz, t.locale)}, ${formatTime(iso, tz, t.locale)}`;
  const back = <Link href="/student/quizzes" className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {t("Teste")}</Link>;

  // A running attempt: the test itself.
  if (quiz.attempt_id) {
    const questions = publicQuestions(quiz.questions);
    const images = await signPaths(questions.map(q => q.image));
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <QuizPlayer assignmentId={id} title={quiz.title} instructions={quiz.description} questions={questions} draft={quiz.draft ?? {}} deadlineAt={quiz.deadline_at} images={images} />
      </div>
    );
  }

  const now = new Date().getTime();
  const closed = quiz.quiz_state === "finished" || quiz.quiz_state === "archived";
  const notYet = !!quiz.starts_at && new Date(quiz.starts_at).getTime() > now;
  const pastDue = !!quiz.due_at && new Date(quiz.due_at).getTime() < now;
  const left = quiz.max_attempts - quiz.attempts_used;
  const canStart = !closed && !notYet && !pastDue && left > 0 && quiz.question_count > 0;
  const done = quiz.status === "submitted";

  let review: Review | null = null;
  if (done) {
    const { data } = await supabase.rpc("quiz_review_for_student", { p_assignment_id: id });
    review = (Array.isArray(data) ? data[0] : null) as Review | null;
  }
  const reviewQs = review ? storedQuestions(review.questions) : [];
  const images = reviewQs.length ? await signPaths(reviewQs.map(q => q.image)) : {};
  const pc = percent(quiz.score, quiz.max_score);
  const passed = pc != null && pc >= quiz.pass_percent;

  const info = [
    { icon: ListChecks, text: t.n("{n} întrebare|{n} întrebări|{n} de întrebări", quiz.question_count) + " · " + t("total {n} p", { n: Number(quiz.total_points) }) },
    { icon: Timer, text: quiz.time_limit_min ? t("Durata: {n} min", { n: quiz.time_limit_min }) : t("Fără limită de timp") },
    quiz.starts_at ? { icon: CalendarClock, text: t("Începe: {date}", { date: when(quiz.starts_at) }) } : null,
    quiz.due_at ? { icon: Clock3, text: t("Termen: {date}", { date: when(quiz.due_at) }) } : null,
    { icon: RotateCcw, text: t("Încercări: {used} din {max}", { used: quiz.attempts_used, max: quiz.max_attempts }) }
  ].filter((x): x is { icon: typeof ListChecks; text: string } => !!x);

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <h1 className="text-[24px] font-extrabold tracking-tight">{quiz.title}</h1>
      {quiz.description && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-soft p-3 text-[13px] text-ink">{quiz.description}</p>}

      {done && (
        <Card className="mt-6 flex flex-wrap items-center gap-4 p-5">
          <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-[18px] font-extrabold text-white ${passed ? "bg-[#1b8a5a]" : pc != null && pc >= 50 ? "bg-[#d38b12]" : "bg-[#c03a3a]"}`}>{pc}%</span>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold">{t("Ai obținut {score} din {max} puncte", { score: Number(quiz.score), max: Number(quiz.max_score) })}</p>
            <p className="text-[12px] text-muted">
              {[passed ? t("Test promovat") : t("Pragul de promovare este {n}%", { n: quiz.pass_percent }), quiz.submitted_at ? t("trimis {date}", { date: when(quiz.submitted_at) }) : null].filter(Boolean).join(" · ")}
            </p>
            {quiz.needs_review && <p className="mt-1 text-[12px] font-bold text-[#a06a0c]">{t("Unele răspunsuri sunt verificate de profesor; nota se poate schimba.")}</p>}
          </div>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <ul className="grid gap-2 text-[13px] text-ink sm:grid-cols-2">
          {info.map(x => <li key={x.text} className="flex items-center gap-2"><x.icon className="h-4 w-4 shrink-0 text-primary" /> {x.text}</li>)}
        </ul>
        <div className="mt-5">
          {canStart ? (
            <>
              {!done && <p className="mb-3 text-[12px] text-muted">{quiz.time_limit_min ? t("Cronometrul pornește când apeși butonul. Răspunsurile se salvează automat.") : t("Răspunsurile se salvează automat; poți reveni oricând până la termen.")}</p>}
              <StartQuizButton assignmentId={id} label={done ? t("Rezolvă din nou") : t("Începe testul")} demo={p.mode === "demo"} />
            </>
          ) : !done && (
            <p className="rounded-xl bg-[#fff8e8] p-3 text-[12px] font-semibold text-[#7a5410]">
              {closed ? t("Profesorul a închis acest test.") : notYet && quiz.starts_at ? t("Testul se deschide la {date}.", { date: when(quiz.starts_at) }) : pastDue ? t("Termenul a trecut.") : quiz.question_count === 0 ? t("Testul nu are întrebări.") : t("Nu mai ai încercări.")}
            </p>
          )}
        </div>
      </Card>

      {done && review && (
        <div className="mt-6">
          <p className="mb-3 text-[15px] font-extrabold text-ink">{t("Răspunsurile tale")}</p>
          {!review.reveal && <p className="mb-3 text-[12px] text-muted">{quiz.show_answers === "never" ? t("Profesorul nu afișează răspunsurile corecte la acest test.") : t("Răspunsurile corecte apar după ultima încercare sau după termen.")}</p>}
          <AnswerView questions={reviewQs} answers={review.answers ?? {}} scores={review.scores ?? {}} feedback={review.feedback ?? {}} reveal={review.reveal} images={images} />
        </div>
      )}
    </div>
  );
}
