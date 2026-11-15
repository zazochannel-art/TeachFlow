import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DemoNotice, PageHeader } from "@/components/ui";
import { QuizBuilder } from "@/components/quiz/QuizBuilder";
import { PendingMigration } from "@/components/PendingMigration";
import { loadWorkspace, requireTeacher } from "@/lib/data/workspace";
import { loadTeacherQuizzes } from "@/lib/data/quizzes";
import { aiConfigured } from "@/lib/ai/claude";
import { getT } from "@/lib/i18n/server";

export const maxDuration = 60;

/** New test: settings, AI generation and the question editor. */
export default async function NewQuizPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const [ws, session, data, t, sp] = await Promise.all([loadWorkspace(), requireTeacher(), loadTeacherQuizzes(), getT(), searchParams]);
  const course = ws.courses.some(c => c.id === sp.course) ? sp.course : undefined;
  return (
    <div>
      <Link href="/quizzes" className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> {t("Teste AI")}</Link>
      <PageHeader title={t("Creează un test cu AI")} subtitle={t("Descrie testul, alege tipurile de întrebări, apoi verifică și modifică ce a generat AI-ul.")} />
      {!data.ready ? <PendingMigration file="0014" /> : (
        <QuizBuilder quiz={null} quizId={crypto.randomUUID()} isNew teacherId={session.userId ?? null} images={{}} aiReady={aiConfigured()} defaultCourse={course}
          courses={ws.courses.filter(c => c.is_active).map(c => ({ id: c.id, title: c.title }))} />
      )}
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
