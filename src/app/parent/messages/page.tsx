import { Card, DemoNotice, SectionTitle } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { loadParentPortal } from "@/lib/data/parent";
import { markParentMessagesRead, sendParentMessage } from "@/lib/actions/student";
import { formatDate, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import { ChildPicker } from "../ChildPicker";

/** Parent <-> teacher conversation about one child (separate from the student's own conversation). */
export default async function ParentMessages({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const [p, t, sp] = await Promise.all([loadParentPortal(), getT(), searchParams]);
  const child = p.children.find(c => c.studentId === sp.c) ?? p.children[0];
  if (p.mode === "live" && p.messages.some(m => m.direction === "outgoing" && !m.read_at)) await markParentMessagesRead();

  if (!child) return <p className="text-[13px] text-muted">{t("Contul tău nu este încă legat de niciun copil.")}</p>;
  const thread = p.messages.filter(m => m.student_id === child.studentId);

  return (
    <div className="mx-auto max-w-3xl">
      <ChildPicker items={p.children} active={child.studentId} base="/parent/messages" />
      <SectionTitle>{t("Mesaje cu {name} despre {child}", { name: child.teacherName, child: child.name.split(" ")[0] })}</SectionTitle>
      <Card className="p-5">
        <div className="tf-scroll flex max-h-[55vh] flex-col gap-3 overflow-y-auto pb-2">
          {thread.length === 0 && <p className="py-8 text-center text-[12px] text-muted">{t("Niciun mesaj încă. Scrie-i profesorului mai jos.")}</p>}
          {thread.map(m => {
            const mine = m.direction === "incoming";
            const other = mine && m.author_id && m.author_id !== p.userId;
            return (
              <div key={m.id} className={`max-w-[80%] rounded-[18px] px-4 py-2.5 text-[13px] ${mine ? "self-end bg-primary text-white" : "self-start bg-soft text-ink"}`}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>{other ? `${t("Alt părinte")} · ` : ""}{formatDate(m.created_at, p.timezone, t.locale)}, {formatTime(m.created_at, p.timezone, t.locale)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <ActionForm action={sendParentMessage} submitLabel={t("Trimite")} className="grid gap-3" resetOnOk demo={p.mode === "demo"}>
            <input type="hidden" name="student_id" value={child.studentId} />
            <textarea name="body" required rows={3} maxLength={4000} className="tf-input" placeholder={t("Scrie un mesaj…")} aria-label={t("Mesaj")} />
          </ActionForm>
          <p className="mt-2 text-[11px] text-muted">{t("Elevul nu vede această conversație.")}</p>
        </div>
      </Card>
      {p.mode === "demo" && <DemoNotice />}
    </div>
  );
}
