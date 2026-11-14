import Link from "next/link";
import { CourseTile, CreateCourseTile, DemoNotice, EmptyNote, FeedCard, SectionTitle } from "@/components/ui";
import { Timetable } from "@/components/Timetable";
import { loadWorkspace } from "@/lib/data/workspace";
import { courseCards, daySlots, notifications, tasks } from "@/lib/data/derive";
import { dateKey, isDateKey } from "@/lib/time";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ws = await loadWorkspace();
  const { date } = await searchParams;
  const now = new Date();
  const key = isDateKey(date) ? date : dateKey(now, ws.timezone);

  const cards = courseCards(ws);
  const slots = daySlots(ws, key, now);
  const notes = notifications(ws, now);
  const todo = tasks(ws, now);

  return (
    <div className="grid flex-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* Center column */}
      <div className="flex min-w-0 flex-col">
        <section>
          <SectionTitle action={cards.length > 4 ? <Link href="/courses" className="text-[11px] font-bold text-primary">Vezi toate</Link> : undefined}>
            Cursurile și grupele tale
          </SectionTitle>
          <div className="tf-scroll grid auto-cols-[minmax(140px,calc((100%-4rem)/5))] grid-flow-col gap-4 overflow-x-auto pb-1">
            {cards.map((card, i) => <CourseTile key={card.id} card={card} index={i} />)}
            <CreateCourseTile />
          </div>
        </section>

        <div className="mt-7 grid flex-1 gap-6 md:grid-cols-2">
          <section id="notificari" className="scroll-mt-6">
            <SectionTitle>Notificări</SectionTitle>
            <div className="space-y-3.5">
              {notes.length ? notes.map(n => <FeedCard key={n.id} item={n} />) : <EmptyNote>Nu ai notificări noi.</EmptyNote>}
            </div>
          </section>
          <section>
            <SectionTitle>De făcut astăzi</SectionTitle>
            <div className="space-y-3.5">
              {todo.length ? todo.map(t => <FeedCard key={t.id} item={t} />) : <EmptyNote>Totul e la zi. Nicio sarcină în așteptare.</EmptyNote>}
            </div>
          </section>
        </div>
        {ws.mode === "demo" && <DemoNotice />}
      </div>

      {/* Right column — timetable */}
      <section className="flex min-h-0 flex-col">
        <SectionTitle>Orar</SectionTitle>
        <div className="relative min-h-[420px] flex-1">
          <Timetable slots={slots} className="max-h-[560px] xl:absolute xl:inset-0 xl:max-h-none" />
        </div>
      </section>
    </div>
  );
}
