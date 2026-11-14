import { BookOpen, CalendarClock } from "lucide-react";
import { Avatar, Card, CourseTile, CreateCourseTile, DemoNotice, EmptyState, PageHeader, Pill, SectionTitle, SubjectIcon } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { courseCards } from "@/lib/data/derive";
import { formatDate, formatMoney, formatTime } from "@/lib/time";
import Link from "next/link";

export default async function CoursesPage() {
  const ws = await loadWorkspace();
  const cards = courseCards(ws, true);
  const now = new Date();
  const studentName = new Map(ws.students.map(s => [s.id, s.full_name]));

  return (
    <div>
      <PageHeader title="Cursuri și grupe" subtitle={`${ws.courses.filter(c => c.is_active).length} active · ${ws.courses.length} în total`}
        action={<Link href="/courses/new" className="tf-btn">+ Curs nou</Link>} />

      <div className="tf-scroll mb-8 grid auto-cols-[minmax(140px,calc((100%-5rem)/6))] grid-flow-col gap-4 overflow-x-auto pb-1">
        {cards.map((c, i) => <CourseTile key={c.id} card={c} index={i} />)}
        <CreateCourseTile />
      </div>

      {ws.courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="Niciun curs încă" text="Creează primul curs individual sau prima grupă. Elevii înscriși și progresul lecțiilor vor apărea pe card."
          action={<Link href="/courses/new" className="tf-btn">Creează un curs</Link>} />
      ) : (
        <>
          <SectionTitle>Detalii</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {ws.courses.map(course => {
              const card = cards.find(c => c.id === course.id)!;
              const enrolled = ws.enrollments.filter(e => e.course_id === course.id && e.status === "active");
              const next = ws.lessons.find(l => l.course_id === course.id && l.status === "scheduled" && new Date(l.starts_at) > now);
              return (
                <Card key={course.id} className="scroll-mt-6 p-5">
                  <div id={course.id} className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><SubjectIcon kind={card.subject} className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-[14px] font-extrabold text-ink">{course.title}</h3>
                        {!course.is_active && <Pill tone="gray">Inactiv</Pill>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {[course.subject, course.level, course.format === "group" ? "Grupă" : "Individual"].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  {course.description && <p className="mt-3 line-clamp-2 text-[12px] text-muted">{course.description}</p>}

                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[11px] font-bold"><span className="text-muted">Progres lecții</span><span>{card.progress == null ? "—" : `${card.progress}%`}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-primary" style={{ width: `${card.progress ?? 0}%` }} /></div>
                    <p className="mt-1 text-[10px] text-muted">{card.lessonsDone} din {card.lessonsTotal} lecții ținute</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex -space-x-1.5">
                      {enrolled.slice(0, 5).map(e => <Avatar key={e.id} name={studentName.get(e.student_id) ?? "?"} size={28} className="ring-2 ring-white" />)}
                      {enrolled.length === 0 && <span className="text-[11px] text-muted">Niciun elev înscris</span>}
                    </div>
                    <span className="text-[12px] font-extrabold">{course.price != null ? formatMoney(course.price, course.currency) : "—"}</span>
                  </div>
                  {next && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-soft px-3 py-2 text-[11px] text-muted">
                      <CalendarClock className="h-3.5 w-3.5 text-primary" /> Următoarea lecție: <strong className="text-ink">{formatDate(next.starts_at, ws.timezone)}, {formatTime(next.starts_at, ws.timezone)}</strong>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
