import Link from "next/link";
import { Mail, MessageCircle, Phone, Search, ChevronLeft } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, MigrationNotice, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { loadWorkspace } from "@/lib/data/workspace";
import { addMessage, markConversationRead } from "@/lib/actions/messages";
import { dateKey, formatDate, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ student?: string; q?: string; with?: string }> }) {
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
  // Migration 0012: a separate conversation with the student's parents.
  const channels = Boolean(ws.parentsReady) || demo;
  const channel = channels && sp.with === "parent" ? "parent" : "student";
  const chanOf = (m: (typeof ws.messages)[number]) => m.channel ?? "student";
  const mine = active ? ws.messages.filter(m => m.student_id === active.id) : [];
  const conversation = mine.filter(m => chanOf(m) === channel);
  const unreadIn = (c: string) => mine.filter(m => chanOf(m) === c && m.direction === "incoming" && !m.read_at).length;
  const tabUnread = { student: unreadIn("student"), parent: unreadIn("parent") };
  if (active && !demo && !missing) await markConversationRead(active.id, channels ? channel : undefined);
  const today = dateKey(new Date(), ws.timezone);
  // Phones show one pane at a time: the list, or the open conversation with a back link.
  const picked = Boolean(sp.student);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("Mesaje")} subtitle={t("Conversațiile cu elevii și părinții, într-un singur loc")} />
      {missing && <MigrationNotice table="messages" />}

      <div className="grid flex-1 gap-6 lg:min-h-[560px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={`min-h-0 flex-col p-2 ${picked ? "hidden lg:flex" : "flex"}`}>
          <form action="/messages" className="m-2 flex items-center gap-2 rounded-xl bg-soft px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input name="q" defaultValue={sp.q} placeholder={t("Caută un elev")} aria-label={t("Caută un elev")} className="w-full bg-transparent text-[12px] outline-none" />
          </form>
          <div className="tf-scroll min-h-0 flex-1 overflow-y-auto lg:max-h-[640px]">
            {threads.length === 0 && <p className="p-4 text-[12px] text-muted">{t("Niciun elev.")}</p>}
            {threads.map(({ s, last, unread }) => (
              <Link key={s.id} href={`/messages?student=${s.id}`}
                className={`flex items-center gap-3 rounded-2xl p-3 ${active?.id === s.id ? "bg-primary text-white" : "hover:bg-soft"}`}>
                <Avatar name={s.full_name} src={s.avatar_url} size={38} />
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
          <Card className={`min-h-0 flex-col ${picked ? "flex" : "hidden lg:flex"}`}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
              <Link href="/messages" aria-label={t("Înapoi")} className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink hover:bg-soft lg:hidden"><ChevronLeft className="h-5 w-5" /></Link>
              <Avatar name={active.full_name} src={active.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-extrabold">{active.full_name}</div>
                <div className="truncate text-[11px] text-muted">{[active.email, active.phone].filter(Boolean).join(" · ") || t("Fără date de contact")}</div>
              </div>
              {active.email && <a href={`mailto:${active.email}`} aria-label={t("Trimite email")} className="grid h-9 w-9 place-items-center rounded-full bg-tint text-primary-2"><Mail className="h-4 w-4" /></a>}
              {active.phone && <a href={`tel:${active.phone}`} aria-label={t("Sună")} className="grid h-9 w-9 place-items-center rounded-full bg-tint text-primary-2"><Phone className="h-4 w-4" /></a>}
            </div>

            {channels && (
              <div className="flex gap-1 border-b border-line px-4 py-2 sm:px-5">
                {(["student", "parent"] as const).map(c => (
                  <Link key={c} href={`/messages?student=${active.id}${c === "parent" ? "&with=parent" : ""}`} aria-current={channel === c ? "page" : undefined}
                    className={`rounded-xl px-3 py-1.5 text-[12px] font-bold ${channel === c ? "bg-primary text-white" : "text-muted hover:bg-soft"}`}>
                    {c === "student" ? t("Cu elevul") : t("Cu părinții")}
                    {channel !== c && tabUnread[c] > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white">{tabUnread[c]}</span>}
                  </Link>
                ))}
              </div>
            )}
            <div className="tf-scroll flex min-h-[280px] flex-1 flex-col gap-3 overflow-y-auto bg-soft/60 px-4 py-5 sm:px-5 lg:max-h-[520px]">
              {conversation.length === 0 && <p className="m-auto text-[12px] text-muted">{t("Începe conversația cu {name}.", { name: active.full_name.split(" ")[0] })}</p>}
              {conversation.map(m => (
                <div key={m.id} className={`max-w-[85%] sm:max-w-[78%] rounded-[18px] px-4 py-2.5 text-[12px] leading-relaxed ${m.direction === "outgoing" ? "self-end rounded-br-md bg-primary text-white" : "self-start rounded-bl-md bg-white text-ink shadow-card"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[10px] ${m.direction === "outgoing" ? "text-white/70" : "text-muted"}`}>{formatDate(m.created_at, ws.timezone, t.locale)}, {formatTime(m.created_at, ws.timezone, t.locale)}</p>
                </div>
              ))}
            </div>

            {!missing && (
              <div className="border-t border-line p-3 sm:p-4">
                <ActionForm action={addMessage} demo={demo} submitLabel={t("Trimite")} resetOnOk className="grid gap-3"
                  extra={
                    <select name="direction" defaultValue="outgoing" aria-label={t("Cine a scris")} className="tf-input w-auto py-2 text-[12px]">
                      <option value="outgoing">{t("Mesaj de la mine")}</option>
                      <option value="incoming">{t(channel === "parent" ? "Primit de la părinte" : "Primit de la elev / părinte")}</option>
                    </select>
                  }>
                  <input type="hidden" name="student_id" value={active.id} />
                  {channel === "parent" && <input type="hidden" name="channel" value="parent" />}
                  <textarea name="body" required rows={2} placeholder={t("Scrie un mesaj…")} aria-label={t("Mesaj")} className="tf-input resize-none" />
                </ActionForm>
                <p className="mt-2 text-[10px] text-muted">{channel === "parent" ? t("Părinții cu cont văd această conversație în portalul lor. Elevul nu o vede.") : t(active.user_id ? "Elevul are cont și vede mesajele tale în portalul lui." : "Mesajele sunt salvate în istoricul elevului. Elevul nu are încă cont, așa că scrie-i și prin email sau telefon. Îl poți invita din pagina Elevi.")}</p>
              </div>
            )}
          </Card>
        ) : (
          <div className="hidden lg:block"><EmptyState icon={MessageCircle} title={t("Alege o conversație")} text={t("Selectează un elev din listă pentru a vedea istoricul mesajelor.")} /></div>
        )}
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
