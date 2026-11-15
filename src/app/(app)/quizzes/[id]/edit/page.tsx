import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { QuizBuilder } from "@/components/quiz/QuizBuilder";
import { PendingMigration } from "@/components/PendingMigration";
import { loadWorkspace, requireTeacher } from "@/lib/data/workspace";
import { loadQuizDetail } from "@/lib/data/quizzes";
import { signPaths } from "@/lib/data/files";
import { aiConfigured } from "@/lib/ai/claude";
import { getT } from "@/lib/i18n/server";

export const maxDuration = 60;

/** Edit a test in the builder. Results already handed in keep their own copy of the questions. */
export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ws, session, data, t] = await Promise.all([loadWorkspace(), requireTeacher(), loadQuizDetail(id), getT()]);
  if (!data.ready) return <PendingMigration file="0014" />;
  if (!data.quiz) notFound();
  const quiz = data.quiz;
  const images = await signPaths(quiz.questions.map(q => q.image));
  const answered = data.attempts.some(a => a.status === "submitted");
  return (
    <div>
      <Link href={`/quizzes/${quiz.id}`} className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {quiz.title}</Link>
      <PageHeader title={t("Editează testul")} subtitle={quiz.version > 1 ? t("Versiunea {n}", { n: quiz.version }) : undefined} />
      {answered && <p className="mb-4 rounded-xl bg-[#fff8e8] p-3 text-[12px] text-[#7a5410]">{t("Rezultatele deja trimise rămân neschimbate; modificările se aplică încercărilor noi.")}</p>}
      <QuizBuilder quiz={quiz} quizId={quiz.id} isNew={false} teacherId={session.userId ?? null} images={images} aiReady={aiConfigured()}
        courses={ws.courses.map(c => ({ id: c.id, title: c.title }))} />
    </div>
  );
}
