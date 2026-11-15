import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import { Card, DemoNotice, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { PendingMigration } from "@/components/PendingMigration";
import { loadStudentPortal } from "@/lib/data/student";
import { loadMyQuizAssignments } from "@/lib/data/quizzes";
import { percent } from "@/lib/quiz";
import { formatDate } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

/** The student's quizzes: to do first, then the results (migrations 0013–0014). */
export default async function StudentQuizzes() {
  const [p, data, t] = await Promise.all([loadStudentPortal(), loadMyQuizAssignments(), getT()]);
  const now = new Date();
  const todo = data.assignments.filter(a => a.status === "assigned").sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const done = data.assignments.filter(a => a.status === "submitted");
  const course = new Map(p.courses.map(c => [c.id, c.title]));

  const row = (a: (typeof data.assignments)[number]) => {
    const pc = percent(a.score, a.max_score);
    const late = a.status === "assigned" && a.due_at && new Date(a.due_at) < now;
    return (
      <Link key={a.id} href={`/student/quizzes/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-soft">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><ListChecks className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-extrabold">{a.title}</span>
          <span className="block truncate text-[11px] text-muted">
            {[a.course_id ? course.get(a.course_id) : null, a.status === "submitted" && a.submitted_at ? t("trimis {date}", { date: formatDate(a.submitted_at, p.timezone, t.locale) }) : a.due_at ? t("termen {date}", { date: formatDate(a.due_at, p.timezone, t.locale) }) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        {a.needs_review && <Pill tone="amber">{t("De verificat")}</Pill>}
        {a.status === "submitted" ? <Pill tone={pc != null && pc >= 50 ? "green" : "amber"}>{`${a.score}/${a.max_score}`}</Pill> : <Pill tone={late ? "red" : "blue"}>{late ? t("Întârziat") : t("De rezolvat")}</Pill>}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[24px] font-extrabold tracking-tight">{t("Teste")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("Rezolvă testele de la profesori. Nota apare imediat după ce trimiți.")}</p>
      <div className="mt-6">
        {!data.ready && <PendingMigration file="0014" />}
        {data.ready && data.assignments.length === 0 && <EmptyState icon={ListChecks} title={t("Niciun test deocamdată")} text={t("Când profesorul îți dă un test, îl găsești aici și primești o notificare.")} />}
        {todo.length > 0 && (<><SectionTitle>{t("De rezolvat")}</SectionTitle><Card className="mb-8 divide-y divide-line overflow-hidden">{todo.map(row)}</Card></>)}
        {done.length > 0 && (<><SectionTitle>{t("Rezultate")}</SectionTitle><Card className="divide-y divide-line overflow-hidden">{done.map(row)}</Card></>)}
      </div>
      {p.mode === "demo" && <DemoNotice />}
    </div>
  );
}
