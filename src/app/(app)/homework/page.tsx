import { ClipboardList } from "lucide-react";
import { Card, DemoNotice, EmptyState, PageHeader, SectionTitle, SubjectIcon } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/workspace";
import { toSlot } from "@/lib/data/derive";
import { formatDate } from "@/lib/time";

export default async function HomeworkPage() {
  const ws = await loadWorkspace();
  const now = new Date();
  const recent = ws.lessons
    .filter(l => l.status === "completed" && new Date(l.ends_at) <= now)
    .slice(-8).reverse()
    .map(l => toSlot(ws, l, now, null));

  return (
    <div>
      <PageHeader title="Teme" subtitle="Teme de atribuit și de verificat" />
      <EmptyState icon={ClipboardList} title="Modulul de teme urmează"
        text="Baza de date nu are încă un tabel pentru teme, așa că nu afișăm teme inventate. Mai jos sunt lecțiile finalizate recent, pentru care vei putea atribui teme." />
      <div className="mt-8">
        <SectionTitle>Lecții finalizate recent</SectionTitle>
        {recent.length === 0 ? <p className="text-[12px] text-muted">Nicio lecție finalizată încă.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {recent.map(s => (
              <Card key={s.id} className="flex items-center gap-4 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-primary-2"><SubjectIcon kind={s.subject} className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 text-[12px]">
                  <div className="truncate font-extrabold text-ink">{s.title}</div>
                  <div className="truncate text-muted">{formatDate(s.startsAt, ws.timezone)} · {s.start}{s.subtitle ? ` · ${s.subtitle}` : ""}</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {ws.mode === "demo" && <DemoNotice />}
    </div>
  );
}
