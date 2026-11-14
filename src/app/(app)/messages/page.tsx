import Link from "next/link";
import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, MigrationNotice, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { loadWorkspace } from "@/lib/data/workspace";
import { addMessage, markConversationRead } from "@/lib/actions/messages";
import { dateKey, formatDate, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ student?: string; q?: string }> }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const sp = await searchParams;
  const missing = ws.missingTables.includes("messages");
  const demo = ws.mode === "demo";
  const needle = (sp.q ?? "").trim().toLowerCase();

  const threads = ws.students
    .filter(s => s.status === "active" || ws.messages.some(m => m.student_id === s.id))
    .filter(s => !needle || s.full_name.toLowerCase().includes(needle))
    .map(s => {
      const msgs = ws.messages.filter(m => m.student_id === s.id);
      const last = msgs[msgs.length - 1];
      return { s, last, unread: msgs.filter(m => m.direction === "incoming" && !m.read_at).length };
    })
    .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? "") || a.s.full_name.localeCompare(b.s.full_name));

  const active = ws.students.find(s => s.id === sp.student) ?? (sp.student ? undefined : threads.find(th => th.last)?.s);
  const conversation = active ? ws.messages.filter(m => m.student_id === active.id) : [];
  if (active && !demo && !missing) await markConversationRead(active.id);
  const today = dateKey(new Date(), ws.timezone);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("Mesaje")} subtitle={t("Conversațiile cu elevii și părinții, într-un singur loc")} />
      {missing && <MigrationNotice table="messages" />}

      <div className="grid min-h-[560px] flex-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col p-2">
          <form action="/messages" className="m-2 flex items-center gap-2 rounded-xl bg-soft px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input name="q" defaultValue={sp.q} placeholder={t("Caută un elev")} aria-label={t("Caută un elev")} className="w-full bg-transparent text-[12px] outline-none" />
          </form>
          <div className="tf-scroll min-h-0 flex-1 overflow-y-auto lg:max-h-[640px]">
            {threads.length === 0 && <p className="p-4 text-[12px] text-muted">{t("Niciun elev.")}</p>}
            {threads.map(({ s, last, unread }) => (
              <Link key={s.id} href={`/messages?student=${s.id}`}
                className={`flex items-center gap-3 rounded-2xl p-3 ${active?.id === s.id ? "bg-primary text-white" : "hover:bg-soft"}`}>
                <Avatar name={s.full_name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-extrabold">{s.full_name}</span>
                    {last && <span className={`shrink-0 text-[10px] ${active?.id === s.id ? "text-white/70" : "text-muted"}`}>{dateKey(new Date(last.created_at), ws.timezone) === today ? formatTime(last.created_at, ws.timezone, t.locale) : formatDate(last.created_at, ws.timezone, t.locale)}</span>}
                  </div>
                  <div className={`truncate text-[11px] ${active?.id === s.id ? "text-white/80" : unread ? "font-bold text-ink" : "text-muted"}`}>
                    {last ? `${last.direction === "outgoing" ? `${t("Tu")}: ` : ""}${last.body}` : t("Niciun mesaj încă")}
                  </div>
                </div>
                {unread > 0 && active?.id !== s.id && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white">{unread}</span>}
              </Link>
            ))}
          </div>
        </Card>

        {active ? (
          <Card className="flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Avatar name={active.full_name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-extrabold">{active.full_name}</div>
                <div className="truncate text-[11px] text-muted">{[active.email, active.phone].filter(Boolean).join(" · ") || t("Fără date de contact")}</div>
              </div>
              {active.email && <a href={`mailto:${active.email}`} aria-label={t("Trimite email")} className="grid h-9 w-9 place-items-center rounded-full bg-tint text-primary-2"><Mail className="h-4 w-4" /></a>}
              {active.phone && <a href={`tel:${active.phone}`} aria-label={t("Sună")} className="grid h-9 w-9 place-items-center rounded-full bg-tint text-primary-2"><Phone className="h-4 w-4" /></a>}
            </div>

            <div className="tf-scroll flex min-h-[280px] flex-1 flex-col gap-3 overflow-y-auto bg-soft/60 px-5 py-5 lg:max-h-[520px]">
              {conversation.length === 0 && <p className="m-auto text-[12px] text-muted">{t("Începe conversația cu {name}.", { name: active.full_name.split(" ")[0] })}</p>}
              {conversation.map(m => (
                <div key={m.id} className={`max-w-[78%] rounded-[18px] px-4 py-2.5 text-[12px] leading-relaxed ${m.direction === "outgoing" ? "self-end rounded-br-md bg-primary text-white" : "self-start rounded-bl-md bg-white text-ink shadow-card"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[10px] ${m.direction === "outgoing" ? "text-white/70" : "text-muted"}`}>{formatDate(m.created_at, ws.timezone, t.locale)}, {formatTime(m.created_at, ws.timezone, t.locale)}</p>
                </div>
              ))}
            </div>

            {!missing && (
              <div className="border-t border-line p-4">
                <ActionForm action={addMessage} demo={demo} submitLabel={t("Trimite")} resetOnOk className="grid gap-3"
                  extra={
                    <select name="direction" defaultValue="outgoing" aria-label={t("Cine a scris")} className="tf-input w-auto py-2 text-[12px]">
                      <option value="outgoing">{t("Mesaj de la mine")}</option>
                      <option value="incoming">{t("Primit de la elev / părinte")}</option>
                    </select>
                  }>
                  <input type="hidden" name="student_id" value={active.id} />
                  <textarea name="body" required rows={2} placeholder={t("Scrie un mesaj…")} aria-label={t("Mesaj")} className="tf-input resize-none" />
                </ActionForm>
                <p className="mt-2 text-[10px] text-muted">{t(active.user_id ? "Elevul are cont și vede mesajele tale în portalul lui." : "Mesajele sunt salvate în istoricul elevului. Elevul nu are încă cont, așa că scrie-i și prin email sau telefon. Îl poți invita din pagina Elevi.")}</p>
              </div>
            )}
          </Card>
        ) : (
          <EmptyState icon={MessageCircle} title={t("Alege o conversație")} text={t("Selectează un elev din listă pentru a vedea istoricul mesajelor.")} />
        )}
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
