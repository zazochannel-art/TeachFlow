import Link from "next/link";
import { Mail, Phone, Search, Users } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, PageHeader, Pill } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { formatDate } from "@/lib/time";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ws = await loadWorkspace();
  const { q = "" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const students = ws.students.filter(s => !needle || [s.full_name, s.email, s.phone].some(v => v?.toLowerCase().includes(needle)));
  const courseTitle = new Map(ws.courses.map(c => [c.id, c.title]));
  const coursesOf = (id: string) => ws.enrollments.filter(e => e.student_id === id && e.status === "active").map(e => courseTitle.get(e.course_id)).filter(Boolean) as string[];
  const active = ws.students.filter(s => s.status === "active").length;

  return (
    <div>
      <PageHeader
        title="Elevi"
        subtitle={`${ws.students.length} elevi · ${active} activi`}
        action={
          <form className="flex h-11 items-center gap-2 rounded-2xl bg-white px-4 shadow-card" action="/students">
            <Search className="h-4 w-4 text-muted" />
            <input name="q" defaultValue={q} placeholder="Caută după nume, email, telefon" className="w-56 bg-transparent text-[12px] outline-none" />
          </form>
        }
      />

      {students.length === 0 ? (
        <EmptyState icon={Users} title={needle ? "Niciun elev găsit" : "Nu ai încă elevi"}
          text={needle ? `Nu există rezultate pentru „${q}”.` : "Elevii adăugați în contul tău vor apărea aici, împreună cu cursurile la care sunt înscriși."}
          action={needle ? <Link href="/students" className="tf-btn-ghost">Șterge căutarea</Link> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_1.4fr_1.6fr_.7fr_.7fr] gap-4 border-b border-line px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-muted lg:grid">
            <span>Elev</span><span>Contact</span><span>Cursuri</span><span>Status</span><span>Din</span>
          </div>
          {students.map(s => {
            const courses = coursesOf(s.id);
            return (
              <div key={s.id} className="grid gap-3 border-b border-line/70 px-5 py-4 text-[12px] last:border-0 lg:grid-cols-[1.6fr_1.4fr_1.6fr_.7fr_.7fr] lg:items-center lg:gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={s.full_name} size={38} />
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-ink">{s.full_name}</div>
                    {s.notes && <div className="truncate text-[11px] text-muted">{s.notes}</div>}
                  </div>
                </div>
                <div className="space-y-1 text-muted">
                  {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-2 hover:text-primary"><Mail className="h-3.5 w-3.5" />{s.email}</a>}
                  {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="h-3.5 w-3.5" />{s.phone}</a>}
                  {!s.email && !s.phone && <span>—</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">{courses.length ? courses.map(c => <Pill key={c}>{c}</Pill>) : <Pill tone="amber">Fără curs</Pill>}</div>
                <div><Pill tone={s.status === "active" ? "green" : "gray"}>{s.status === "active" ? "Activ" : "Inactiv"}</Pill></div>
                <div className="text-muted">{formatDate(s.created_at, ws.timezone)}</div>
              </div>
            );
          })}
        </Card>
      )}
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
