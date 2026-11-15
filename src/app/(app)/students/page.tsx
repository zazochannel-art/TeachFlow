import Link from "next/link";
import { AvatarUpload } from "@/components/AvatarUpload";
import { CalendarDays, ClipboardList, Mail, MessageCircle, Pencil, Phone, Plus, Search, Users, Wallet, Download } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, Field, PageHeader, Panel, Pill, Tabs } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { loadWorkspace, type Workspace } from "@/lib/data/workspace";
import { deleteStudent, enrollStudent, removeEnrollment, saveStudent } from "@/lib/actions/students";
import { formatDate, formatMoney, formatTime } from "@/lib/time";
import { currencyTotals } from "@/lib/data/derive";
import { StudentAccess } from "@/components/StudentAccess";
import { ParentAccess, type LinkedParent } from "@/components/ParentAccess";
import { ageOn } from "@/lib/time";
import type { Student } from "@/types/database";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

type Params = { q?: string; new?: string; edit?: string; status?: string };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const sp = await searchParams;
  const q = sp.q ?? "";
  const filter = sp.status === "inactive" ? "inactive" : sp.status === "all" ? "all" : "active";
  const needle = q.trim().toLowerCase();
  const students = ws.students
    .filter(s => filter === "all" || s.status === filter)
    .filter(s => !needle || [s.full_name, s.email, s.phone].some(v => v?.toLowerCase().includes(needle)));
  const courseTitle = new Map(ws.courses.map(c => [c.id, c.title]));
  const coursesOf = (id: string) => ws.enrollments.filter(e => e.student_id === id && e.status === "active").map(e => courseTitle.get(e.course_id)).filter(Boolean) as string[];
  const editing = sp.edit ? ws.students.find(s => s.id === sp.edit) : undefined;
  const demo = ws.mode === "demo";
  const parents = editing && ws.parentsReady ? await loadParents(editing.id) : [];
  const qs = (status: string) => `/students?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <PageHeader
        title={t("Elevi")}
        subtitle={t("{total} elevi · {active} activi", { total: ws.students.length, active: ws.students.filter(s => s.status === "active").length })}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
            <form className="flex h-11 w-full items-center gap-2 rounded-2xl bg-white px-4 shadow-card sm:w-auto" action="/students">
              <Search className="h-4 w-4 text-muted" />
              <input name="q" defaultValue={q} placeholder={t("Caută după nume, email, telefon")} aria-label={t("Caută elevi")} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none sm:w-56 sm:flex-none" />
              {filter !== "active" && <input type="hidden" name="status" value={filter} />}
            </form>
            {ws.students.length > 0 && <a href="/students/export" download className="tf-btn-ghost h-11 flex-1 sm:flex-none" title={t("Descarcă lista de elevi (CSV, se deschide în Excel)")}><Download className="h-4 w-4" /> {t("Exportă")}</a>}
            <Link href="/students?new=1" className="tf-btn h-11 flex-1 sm:flex-none"><Plus className="h-4 w-4" /> {t("Elev nou")}</Link>
          </div>
        }
      />

      {sp.new && (
        <Panel title={t("Elev nou")} closeHref="/students">
          <StudentForm ws={ws} demo={demo} t={t} />
        </Panel>
      )}
      {editing && (
        <Panel title={t("Editează · {name}", { name: editing.full_name })} closeHref="/students"
          aside={<form action={deleteStudent}><input type="hidden" name="id" value={editing.id} /><ConfirmSubmit label={t("Șterge elevul")} confirm={t("Șterge definitiv")} /></form>}>
          <StudentSummary ws={ws} student={editing} t={t} />
          <StudentForm ws={ws} demo={demo} student={editing} t={t} />
          <Enrollments ws={ws} student={editing} t={t} />
          <StudentAccess studentId={editing.id} studentName={editing.full_name} linked={Boolean(editing.user_id)} demo={demo} />
          {(ws.parentsReady || demo) && <ParentAccess studentId={editing.id} parents={parents} demo={demo} />}
        </Panel>
      )}

      <Tabs active={filter} items={[
        { key: "active", label: t("Activi"), href: qs("active"), count: ws.students.filter(s => s.status === "active").length },
        { key: "inactive", label: t("Inactivi"), href: qs("inactive"), count: ws.students.filter(s => s.status === "inactive").length },
        { key: "all", label: t("Toți"), href: qs("all"), count: ws.students.length }
      ]} />

      {students.length === 0 ? (
        <EmptyState icon={Users} title={needle ? t("Niciun elev găsit") : t("Niciun elev aici")}
          text={needle ? t("Nu există rezultate pentru „{q}”.", { q }) : t("Adaugă elevii tăi și înscrie-i în cursuri sau grupe.")}
          action={needle ? <Link href="/students" className="tf-btn-ghost">{t("Șterge căutarea")}</Link> : <Link href="/students?new=1" className="tf-btn">{t("Adaugă un elev")}</Link>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_1.4fr_1.6fr_.8fr_.9fr_96px] gap-4 border-b border-line px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-muted lg:grid">
            <span>{t("Elev")}</span><span>{t("Contact")}</span><span>{t("Cursuri")}</span><span>{t("Status")}</span><span>{t("Sold")}</span><span />
          </div>
          {students.map(s => {
            const courses = coursesOf(s.id);
            const due = ws.payments.filter(p => p.student_id === s.id && p.status === "pending");
            const unread = ws.messages.filter(m => m.student_id === s.id && m.direction === "incoming" && !m.read_at).length;
            return (
              <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 border-b border-line/70 px-4 py-3.5 text-[12px] last:border-0 sm:px-5 lg:grid-cols-[1.6fr_1.4fr_1.6fr_.8fr_.9fr_96px] lg:gap-4 lg:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={s.full_name} src={s.avatar_url} size={38} />
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-ink">{s.full_name}</div>
                    <div className="truncate text-[11px] text-muted">{s.notes || t("din {date}", { date: formatDate(s.created_at, ws.timezone, t.locale) })}</div>
                  </div>
                </div>
                <div className={`col-span-2 min-w-0 space-y-1 text-muted lg:col-span-1 ${!s.email && !s.phone ? "hidden lg:block" : ""}`}>
                  {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-2 truncate hover:text-primary"><Mail className="h-3.5 w-3.5 shrink-0" />{s.email}</a>}
                  {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="h-3.5 w-3.5" />{s.phone}</a>}
                  {!s.email && !s.phone && <span>—</span>}
                </div>
                <div className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-1">{courses.length ? courses.map(c => <Pill key={c}>{c}</Pill>) : <Pill tone="amber">{t("Fără curs")}</Pill>}</div>
                <div><Pill tone={s.status === "active" ? "green" : "gray"}>{s.status === "active" ? t("Activ") : t("Inactiv")}</Pill></div>
                <div className="text-right lg:text-left">{due.length ? <Link href="/payments?status=pending" className="inline-flex items-center gap-1.5 font-bold text-[#a2660a]"><Wallet className="h-3.5 w-3.5" />{due.map(p => formatMoney(p.amount, p.currency, t.locale)).join(" + ")}</Link> : <span className="text-muted">{t("La zi")}</span>}</div>
                <div className="col-start-2 row-start-1 flex items-center gap-2 lg:col-start-auto lg:row-start-auto lg:justify-end">
                  <Link href={`/messages?student=${s.id}`} aria-label={t("Mesaje · {name}", { name: s.full_name })} className="relative grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2 hover:bg-[#dfe4fb]">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-white" />}
                  </Link>
                  <Link href={`/students?edit=${s.id}`} aria-label={t("Editează · {name}", { name: s.full_name })} className="grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2 hover:bg-[#dfe4fb]"><Pencil className="h-3.5 w-3.5" /></Link>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {demo && <DemoNotice />}
    </div>
  );
}

function StudentForm({ ws, demo, student, t }: { ws: Workspace; demo: boolean; student?: Student; t: T }) {
  return (
    <ActionForm action={saveStudent} demo={demo} submitLabel={student ? t("Salvează") : t("Adaugă elevul")}>
      {student && <input type="hidden" name="id" value={student.id} />}
      <Field label={t("Nume complet")} htmlFor="full_name" wide><input id="full_name" name="full_name" required minLength={2} defaultValue={student?.full_name} className="tf-input" /></Field>
      <Field label={t("Email")} htmlFor="email"><input id="email" name="email" type="email" defaultValue={student?.email ?? ""} className="tf-input" /></Field>
      <Field label={t("Telefon")} htmlFor="phone"><input id="phone" name="phone" type="tel" defaultValue={student?.phone ?? ""} className="tf-input" /></Field>
      <Field label={t("Status")} htmlFor="status">
        <select id="status" name="status" defaultValue={student?.status ?? "active"} className="tf-input"><option value="active">{t("Activ")}</option><option value="inactive">{t("Inactiv")}</option></select>
      </Field>
      {!student && (
        <Field label={t("Înscrie la curs (opțional)")} htmlFor="course_id">
          <select id="course_id" name="course_id" className="tf-input" defaultValue="">
            <option value="">{t("— fără curs —")}</option>
            {ws.courses.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
      )}
      {(ws.parentsReady || demo) && (
        <>
          <Field label={t("Data nașterii")} htmlFor="birth_date"><input id="birth_date" name="birth_date" type="date" min="1900-01-01" max="2100-01-01" defaultValue={student?.birth_date ?? ""} className="tf-input" /></Field>
          <Field label={t("Clasa / nivelul")} htmlFor="grade_level"><input id="grade_level" name="grade_level" maxLength={60} defaultValue={student?.grade_level ?? ""} className="tf-input" placeholder={t("ex. clasa a 7-a, B1")} /></Field>
          <Field label={t("Obiective")} htmlFor="goals" wide><textarea id="goals" name="goals" rows={2} maxLength={1000} defaultValue={student?.goals ?? ""} className="tf-input" placeholder={t("ex. pregătire pentru BAC, vorbire liberă")} /></Field>
          <Field label={t("Părinte: nume")} htmlFor="parent_name"><input id="parent_name" name="parent_name" maxLength={120} defaultValue={student?.parent_name ?? ""} className="tf-input" /></Field>
          <Field label={t("Părinte: telefon")} htmlFor="parent_phone"><input id="parent_phone" name="parent_phone" type="tel" maxLength={40} defaultValue={student?.parent_phone ?? ""} className="tf-input" /></Field>
          <Field label={t("Părinte: email")} htmlFor="parent_email" wide><input id="parent_email" name="parent_email" type="email" maxLength={200} defaultValue={student?.parent_email ?? ""} className="tf-input" /></Field>
        </>
      )}
      <Field label={t("Notițe")} htmlFor="notes" wide><textarea id="notes" name="notes" rows={2} defaultValue={student?.notes ?? ""} className="tf-input" placeholder={t("ex. preferă lecții după 16:00")} /></Field>
    </ActionForm>
  );
}

function Enrollments({ ws, student, t }: { ws: Workspace; student: Student; t: T }) {
  const mine = ws.enrollments.filter(e => e.student_id === student.id);
  const available = ws.courses.filter(c => c.is_active && !mine.some(e => e.course_id === c.id && e.status === "active"));
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 text-[13px] font-extrabold">{t("Cursuri")}</h3>
      <div className="flex flex-wrap gap-2">
        {mine.length === 0 && <span className="text-[12px] text-muted">{t("Nu este înscris la niciun curs.")}</span>}
        {mine.map(e => (
          <form key={e.id} action={removeEnrollment} className="flex items-center gap-2 rounded-xl bg-soft py-1.5 pl-3 pr-1.5 text-[12px] font-bold">
            {ws.courses.find(c => c.id === e.course_id)?.title ?? t("Curs")}
            {e.status !== "active" && <Pill tone="gray">{e.status === "paused" ? t("Pauză") : t("Încheiat")}</Pill>}
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton className="rounded-lg px-2 py-0.5 text-muted hover:bg-white hover:text-[#c03a3a]">×</SubmitButton>
          </form>
        ))}
      </div>
      {available.length > 0 && (
        <form action={enrollStudent} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="student_id" value={student.id} />
          <select name="course_id" className="tf-input w-auto min-w-[200px]" required defaultValue="">
            <option value="" disabled>{t("Alege un curs…")}</option>
            {available.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <SubmitButton className="tf-btn-ghost">{t("Înscrie")}</SubmitButton>
        </form>
      )}
    </div>
  );
}

/** At-a-glance history of one student (lessons, homework, money) with the usual next steps. */
function StudentSummary({ ws, student, t }: { ws: Workspace; student: Student; t: T }) {
  const now = new Date();
  const courseIds = new Set(ws.enrollments.filter(e => e.student_id === student.id && e.status === "active").map(e => e.course_id));
  const lessons = ws.lessons.filter(l => l.student_id === student.id || (!l.student_id && l.course_id && courseIds.has(l.course_id)));
  const held = lessons.filter(l => l.status === "completed").length;
  const missed = lessons.filter(l => l.status === "no_show").length;
  const next = lessons.find(l => l.status === "scheduled" && new Date(l.starts_at) > now);
  const hw = ws.homework.filter(h => h.student_id === student.id);
  const hwOpen = hw.filter(h => h.status !== "reviewed").length;
  const pays = ws.payments.filter(p => p.student_id === student.id);
  const money = (list: typeof pays) => list.length ? currencyTotals(list).map(x => formatMoney(x.amount, x.currency, t.locale)).join(" + ") : "—";
  const tile = "rounded-2xl bg-soft px-4 py-3";
  const action = "inline-flex items-center gap-1.5 rounded-xl bg-tint px-3 py-2 text-[12px] font-bold text-primary-2 hover:bg-[#dfe4fb]";

  return (
    <div className="mb-6 border-b border-line pb-6">
      {ws.mode === "live" && ws.visualReady && (
        <div className="mb-5"><AvatarUpload name={student.full_name} src={student.avatar_url ?? null} studentId={student.id} size={56} /></div>
      )}
      <ProfileFacts student={student} t={t} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={tile}>
          <p className="text-[11px] text-muted">{t("Lecții ținute")}</p>
          <p className="text-[16px] font-extrabold">{held}{missed > 0 && <span className="ml-1.5 text-[11px] font-bold text-[#c03a3a]">{t("· {n} absențe", { n: missed })}</span>}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-muted">{t("Următoarea lecție:")}</p>
          <p className="truncate text-[13px] font-extrabold">{next ? `${formatDate(next.starts_at, ws.timezone, t.locale)}, ${formatTime(next.starts_at, ws.timezone, t.locale)}` : "—"}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-muted">{t("Teme")}</p>
          <p className="text-[16px] font-extrabold">{hw.length}{hwOpen > 0 && <span className="ml-1.5 text-[11px] font-bold text-muted">{t("· {n} deschise", { n: hwOpen })}</span>}</p>
        </div>
        <div className={tile}>
          <p className="text-[11px] text-muted">{t("Plătit / de încasat")}</p>
          <p className="truncate text-[13px] font-extrabold">{money(pays.filter(p => p.status === "paid"))} <span className="text-[#a2660a]">/ {money(pays.filter(p => p.status === "pending"))}</span></p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/payments?new=1&student=${student.id}`} className={action}><Wallet className="h-3.5 w-3.5" /> {t("Înregistrează plată")}</Link>
        <Link href={`/homework?new=1&student=${student.id}`} className={action}><ClipboardList className="h-3.5 w-3.5" /> {t("Dă temă")}</Link>
        <Link href={`/calendar?new=1`} className={action}><CalendarDays className="h-3.5 w-3.5" /> {t("Lecție nouă")}</Link>
        <Link href={`/messages?student=${student.id}`} className={action}><MessageCircle className="h-3.5 w-3.5" /> {t("Mesaje")}</Link>
      </div>
    </div>
  );
}

/** Parent accounts linked to one student (migration 0012), with their sign-in email. */
async function loadParents(studentId: string): Promise<LinkedParent[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("student_parents", { p_student_id: studentId });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ link_id: string; full_name: string; email: string | null }>).map(p => ({ link_id: p.link_id, full_name: p.full_name, email: p.email }));
}

/** Age, class, goals and the parent contact, when the teacher filled them in. */
function ProfileFacts({ student, t }: { student: Student; t: T }) {
  const age = student.birth_date ? ageOn(student.birth_date, new Date()) : null;
  const facts = [
    age != null ? t.n("{n} an|{n} ani|{n} de ani", age) : null,
    student.grade_level || null
  ].filter(Boolean) as string[];
  const parent = [student.parent_name, student.parent_phone, student.parent_email].filter(Boolean).join(" · ");
  if (!facts.length && !student.goals && !parent) return null;
  return (
    <div className="mb-4 grid gap-1.5 rounded-2xl bg-soft px-4 py-3 text-[12px]">
      {facts.length > 0 && <p className="font-extrabold text-ink">{facts.join(" · ")}</p>}
      {student.goals && <p><span className="text-muted">{t("Obiective")}:</span> {student.goals}</p>}
      {parent && <p><span className="text-muted">{t("Părinte")}:</span> {parent}</p>}
    </div>
  );
}
