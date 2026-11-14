import Link from "next/link";
import { LinkIcon, Pencil, Presentation, Video } from "lucide-react";
import { Card, DemoNotice, EmptyState, PageHeader, Pill, SectionTitle, SubjectIcon } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { currentLesson, toSlot } from "@/lib/data/derive";
import { formatDate } from "@/lib/time";

export default async function ClassroomPage() {
  const ws = await loadWorkspace();
  const now = new Date();
  const cur = currentLesson(ws, now);
  const upcoming = ws.lessons
    .filter(l => l.status === "scheduled" && new Date(l.ends_at) > now && l.id !== cur?.id)
    .slice(0, 12)
    .map(l => toSlot(ws, l, now, null));
  const hero = cur ? toSlot(ws, cur, now, cur.id) : null;

  return (
    <div>
      <PageHeader title="Lecții online" subtitle="Intră în lecție cu un singur clic." action={<Link href="/calendar?new=1&back=/classroom" className="tf-btn">+ Lecție nouă</Link>} />

      {hero ? (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-5 rounded-[26px] bg-primary p-6 text-white shadow-lift">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/20"><Video className="h-6 w-6" fill="currentColor" /></span>
            <div>
              <p className="text-[12px] text-white/80">{hero.state === "now" ? "Lecție în desfășurare" : "Următoarea lecție de azi"}</p>
              <p className="text-[20px] font-extrabold">{hero.title}</p>
              <p className="text-[12px] text-white/80">{hero.start} - {hero.end}{hero.subtitle ? ` · ${hero.subtitle}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/classroom/${hero.id}`} className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-extrabold text-primary-2 hover:bg-tint"><Presentation className="h-4 w-4" /> Deschide tabla</Link>
            {hero.meetingUrl
              ? <a href={hero.meetingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-white/80 px-5 py-2.5 text-[13px] font-bold hover:bg-white/10"><Video className="h-4 w-4" fill="currentColor" /> Începe lecția</a>
              : <Link href={`/calendar?lesson=${hero.id}&back=/classroom`} className="rounded-xl bg-white/15 px-4 py-2 text-[12px] font-bold hover:bg-white/25">Adaugă linkul lecției</Link>}
          </div>
        </div>
      ) : (
        <div className="mb-8"><EmptyState icon={Video} title="Nicio lecție acum" text="Când o lecție începe sau urmează astăzi, o vei găsi aici cu butonul de pornire." action={<Link href="/calendar" className="tf-btn">Vezi calendarul</Link>} /></div>
      )}

      <SectionTitle>Următoarele lecții</SectionTitle>
      {upcoming.length === 0 ? <p className="text-[12px] text-muted">Nu ai alte lecții programate.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {upcoming.map(s => (
            <Card key={s.id} className="flex items-center gap-4 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><SubjectIcon kind={s.subject} className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0 flex-1 text-[12px]">
                <div className="truncate font-extrabold text-ink">{s.title}</div>
                <div className="truncate text-muted">{formatDate(s.startsAt, ws.timezone)} · {s.start} - {s.end}{s.subtitle ? ` · ${s.subtitle}` : ""}</div>
              </div>
              <Link href={`/classroom/${s.id}`} aria-label={`Tabla pentru ${s.title}`} title="Tabla lecției" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-tint text-primary-2 hover:bg-[#dfe4fb]"><Presentation className="h-3.5 w-3.5" /></Link>
              {s.meetingUrl
                ? <a href={s.meetingUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-tint px-3 py-2 text-[11px] font-bold text-primary-2 hover:bg-[#dfe4fb]"><LinkIcon className="h-3.5 w-3.5" /> Link</a>
                : <Link href={`/calendar?lesson=${s.id}&back=/classroom`}><Pill tone="amber">Adaugă link</Pill></Link>}
              <Link href={`/calendar?lesson=${s.id}&back=/classroom`} aria-label={`Editează ${s.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-soft text-muted hover:text-primary"><Pencil className="h-3.5 w-3.5" /></Link>
            </Card>
          ))}
        </div>
      )}
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
