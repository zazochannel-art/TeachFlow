import Link from "next/link";
import { Card, DemoNotice, SectionTitle } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { loadStudentPortal } from "@/lib/data/student";
import { markMessagesRead, sendStudentMessage } from "@/lib/actions/student";
import { formatDate, formatTime } from "@/lib/time";

export default async function StudentMessages({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const p = await loadStudentPortal();
  const { s } = await searchParams;
  const link = p.links.find(l => l.studentId === s) ?? p.links[0];
  if (p.mode === "live" && p.messages.some(m => m.direction === "outgoing" && !m.read_at)) await markMessagesRead();

  if (!link) return <p className="text-[13px] text-muted">Contul tău nu este încă legat de un profesor.</p>;
  const thread = p.messages.filter(m => m.student_id === link.studentId);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle>Mesaje cu {link.teacherName}</SectionTitle>
      {p.links.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {p.links.map(l => (
            <Link key={l.studentId} href={`/student/messages?s=${l.studentId}`} className={`rounded-xl px-3 py-1.5 text-[12px] font-bold ${l.studentId === link.studentId ? "bg-primary text-white" : "bg-soft text-muted"}`}>{l.teacherName}</Link>
          ))}
        </div>
      )}
      <Card className="p-5">
        <div className="tf-scroll flex max-h-[55vh] flex-col gap-3 overflow-y-auto pb-2">
          {thread.length === 0 && <p className="py-8 text-center text-[12px] text-muted">Niciun mesaj încă. Scrie-i profesorului mai jos.</p>}
          {thread.map(m => {
            const mine = m.direction === "incoming";
            return (
              <div key={m.id} className={`max-w-[80%] rounded-[18px] px-4 py-2.5 text-[13px] ${mine ? "self-end bg-primary text-white" : "self-start bg-soft text-ink"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>{formatDate(m.created_at, p.timezone)}, {formatTime(m.created_at, p.timezone)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <ActionForm action={sendStudentMessage} submitLabel="Trimite" className="grid gap-3" resetOnOk demo={p.mode === "demo"}>
            <input type="hidden" name="student_id" value={link.studentId} />
            <textarea name="body" required rows={3} maxLength={4000} className="tf-input" placeholder="Scrie un mesaj…" aria-label="Mesaj" />
          </ActionForm>
        </div>
      </Card>
      {p.mode === "demo" && <DemoNotice />}
    </div>
  );
}
