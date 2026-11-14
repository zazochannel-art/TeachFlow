import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { Workspace } from "@/lib/data/workspace";

interface Step { id: string; title: string; text: string; href: string; done: boolean }

/** First-run checklist built from the teacher's real data. Hidden once every step is done. */
export function gettingStartedSteps(ws: Workspace, now = new Date()): Step[] {
  const firstStudent = ws.students[0];
  const upcoming = ws.lessons.filter(l => l.status === "scheduled" && new Date(l.ends_at) >= now);
  const withoutLink = upcoming.find(l => !l.meeting_url);
  return [
    { id: "profile", title: "Completează profilul", text: "Numele și fusul orar apar în orar și în mesaje.", href: "/settings", done: Boolean(ws.profile?.full_name?.trim()) },
    { id: "student", title: "Adaugă primul elev", text: "Nume și date de contact.", href: "/students?new=1", done: ws.students.length > 0 },
    { id: "course", title: "Creează un curs sau o grupă", text: "Materie, nivel și preț.", href: "/courses/new", done: ws.courses.length > 0 },
    { id: "enroll", title: "Înscrie elevul la curs", text: "Leagă elevii de cursurile lor.", href: firstStudent ? `/students?edit=${firstStudent.id}` : "/students", done: ws.enrollments.length > 0 },
    { id: "lesson", title: "Programează o lecție", text: "Poate fi și săptămânală, cu repetare.", href: "/calendar?new=1", done: ws.lessons.length > 0 },
    { id: "link", title: "Adaugă linkul de conectare", text: "Zoom, Meet sau altul, ca lecția să pornească dintr-un clic.", href: withoutLink ? `/calendar?lesson=${withoutLink.id}&back=/dashboard` : "/calendar?new=1", done: ws.lessons.some(l => Boolean(l.meeting_url)) },
  ];
}

export function GettingStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find(s => !s.done)!;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <section aria-labelledby="getting-started" className="mb-7 rounded-[24px] bg-navy p-5 text-white md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="getting-started" className="text-[16px] font-extrabold tracking-tight">Primii pași în TeachFlow</h2>
          <p className="mt-1 text-[12px] text-white/70">{done} din {steps.length} pași gata. Următorul: {next.title.toLowerCase()}.</p>
        </div>
        <Link href={next.href} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-bold hover:bg-primary-2">
          Continuă <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progres">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link href={s.href} className={`flex h-full items-start gap-3 rounded-[16px] p-3 transition-colors ${s.done ? "bg-white/5 text-white/60" : s.id === next.id ? "bg-white/15 hover:bg-white/20" : "bg-white/5 hover:bg-white/10"}`}>
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${s.done ? "bg-[#3fbf7f] text-white" : "bg-white/15"}`}>
                {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[12.5px] font-bold ${s.done ? "line-through decoration-white/40" : ""}`}>{s.title}</span>
                {!s.done && <span className="mt-0.5 block text-[11px] leading-snug text-white/65">{s.text}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
