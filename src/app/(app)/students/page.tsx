import Link from "next/link";
import { Mail, MessageCircle, Pencil, Phone, Plus, Search, Users, Wallet, Download } from "lucide-react";
import { Avatar, Card, DemoNotice, EmptyState, Field, PageHeader, Panel, Pill, Tabs } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { loadWorkspace, type Workspace } from "@/lib/data/workspace";
import { deleteStudent, enrollStudent, removeEnrollment, saveStudent } from "@/lib/actions/students";
import { formatDate, formatMoney } from "@/lib/time";
import { StudentAccess } from "@/components/StudentAccess";
import type { Student } from "@/types/database";

type Params = { q?: string; new?: string; edit?: string; status?: string };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ws = await loadWorkspace();
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
  const qs = (status: string) => `/students?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Elevi"
        subtitle={`${ws.students.length} elevi · ${ws.students.filter(s => s.status === "active").length} activi`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <form className="flex h-11 items-center gap-2 rounded-2xl bg-white px-4 shadow-card" action="/students">
              <Search className="h-4 w-4 text-muted" />
              <input name="q" defaultValue={q} placeholder="Caută după nume, email, telefon" aria-label="Caută elevi" className="w-48 bg-transparent text-[12px] outline-none sm:w-56" />
              {filter !== "active" && <input type="hidden" name="status" value={filter} />}
            </form>
            {ws.students.length > 0 && <a href="/students/export" download className="tf-btn-ghost h-11" title="Descarcă lista de elevi (CSV, se deschide în Excel)"><Download className="h-4 w-4" /> Exportă</a>}
            <Link href="/students?new=1" className="tf-btn h-11"><Plus className="h-4 w-4" /> Elev nou</Link>
          </div>
        }
      />

      {sp.new && (
        <Panel title="Elev nou" closeHref="/students">
          <StudentForm ws={ws} demo={demo} />
        </Panel>
      )}
      {editing && (
        <Panel title={`Editează · ${editing.full_name}`} closeHref="/students"
          aside={<form action={deleteStudent}><input type="hidden" name="id" value={editing.id} /><ConfirmSubmit label="Șterge elevul" confirm="Șterge definitiv" /></form>}>
          <StudentForm ws={ws} demo={demo} student={editing} />
          <Enrollments ws={ws} student={editing} />
          <StudentAccess studentId={editing.id} studentName={editing.full_name} linked={Boolean(editing.user_id)} demo={demo} />
        </Panel>
      )}

      <Tabs active={filter} items={[
        { key: "active", label: "Activi", href: qs("active"), count: ws.students.filter(s => s.status === "active").length },
        { key: "inactive", label: "Inactivi", href: qs("inactive"), count: ws.students.filter(s => s.status === "inactive").length },
        { key: "all", label: "Toți", href: qs("all"), count: ws.students.length }
      ]} />

      {students.length === 0 ? (
        <EmptyState icon={Users} title={needle ? "Niciun elev găsit" : "Niciun elev aici"}
          text={needle ? `Nu există rezultate pentru „${q}”.` : "Adaugă elevii tăi și înscrie-i în cursuri sau grupe."}
          action={needle ? <Link href="/students" className="tf-btn-ghost">Șterge căutarea</Link> : <Link href="/students?new=1" className="tf-btn">Adaugă un elev</Link>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_1.4fr_1.6fr_.8fr_.9fr_96px] gap-4 border-b border-line px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-muted lg:grid">
            <span>Elev</span><span>Contact</span><span>Cursuri</span><span>Status</span><span>Sold</span><span />
          </div>
          {students.map(s => {
            const courses = coursesOf(s.id);
            const due = ws.payments.filter(p => p.student_id === s.id && p.status === "pending");
            const unread = ws.messages.filter(m => m.student_id === s.id && m.direction === "incoming" && !m.read_at).length;
            return (
              <div key={s.id} className="grid gap-3 border-b border-line/70 px-5 py-4 text-[12px] last:border-0 lg:grid-cols-[1.6fr_1.4fr_1.6fr_.8fr_.9fr_96px] lg:items-center lg:gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={s.full_name} size={38} />
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-ink">{s.full_name}</div>
                    <div className="truncate text-[11px] text-muted">{s.notes || `din ${formatDate(s.created_at, ws.timezone)}`}</div>
                  </div>
                </div>
                <div className="space-y-1 text-muted">
                  {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-2 truncate hover:text-primary"><Mail className="h-3.5 w-3.5 shrink-0" />{s.email}</a>}
                  {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="h-3.5 w-3.5" />{s.phone}</a>}
                  {!s.email && !s.phone && <span>—</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">{courses.length ? courses.map(c => <Pill key={c}>{c}</Pill>) : <Pill tone="amber">Fără curs</Pill>}</div>
                <div><Pill tone={s.status === "active" ? "green" : "gray"}>{s.status === "active" ? "Activ" : "Inactiv"}</Pill></div>
                <div>{due.length ? <Link href="/payments?status=pending" className="inline-flex items-center gap-1.5 font-bold text-[#a2660a]"><Wallet className="h-3.5 w-3.5" />{due.map(p => formatMoney(p.amount, p.currency)).join(" + ")}</Link> : <span className="text-muted">La zi</span>}</div>
                <div className="flex items-center gap-2 lg:justify-end">
                  <Link href={`/messages?student=${s.id}`} aria-label={`Mesaje ${s.full_name}`} className="relative grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2 hover:bg-[#dfe4fb]">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {unread > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-white" />}
                  </Link>
                  <Link href={`/students?edit=${s.id}`} aria-label={`Editează ${s.full_name}`} className="grid h-8 w-8 place-items-center rounded-full bg-tint text-primary-2 hover:bg-[#dfe4fb]"><Pencil className="h-3.5 w-3.5" /></Link>
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

function StudentForm({ ws, demo, student }: { ws: Workspace; demo: boolean; student?: Student }) {
  return (
    <ActionForm action={saveStudent} demo={demo} submitLabel={student ? "Salvează" : "Adaugă elevul"}>
      {student && <input type="hidden" name="id" value={student.id} />}
      <Field label="Nume complet" htmlFor="full_name" wide><input id="full_name" name="full_name" required minLength={2} defaultValue={student?.full_name} className="tf-input" /></Field>
      <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" defaultValue={student?.email ?? ""} className="tf-input" /></Field>
      <Field label="Telefon" htmlFor="phone"><input id="phone" name="phone" type="tel" defaultValue={student?.phone ?? ""} className="tf-input" /></Field>
      <Field label="Status" htmlFor="status">
        <select id="status" name="status" defaultValue={student?.status ?? "active"} className="tf-input"><option value="active">Activ</option><option value="inactive">Inactiv</option></select>
      </Field>
      {!student && (
        <Field label="Înscrie la curs (opțional)" htmlFor="course_id">
          <select id="course_id" name="course_id" className="tf-input" defaultValue="">
            <option value="">— fără curs —</option>
            {ws.courses.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
      )}
      <Field label="Notițe" htmlFor="notes" wide><textarea id="notes" name="notes" rows={2} defaultValue={student?.notes ?? ""} className="tf-input" placeholder="ex. părinte: Ana, preferă lecții după 16:00" /></Field>
    </ActionForm>
  );
}

function Enrollments({ ws, student }: { ws: Workspace; student: Student }) {
  const mine = ws.enrollments.filter(e => e.student_id === student.id);
  const available = ws.courses.filter(c => c.is_active && !mine.some(e => e.course_id === c.id && e.status === "active"));
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 text-[13px] font-extrabold">Cursuri</h3>
      <div className="flex flex-wrap gap-2">
        {mine.length === 0 && <span className="text-[12px] text-muted">Nu este înscris la niciun curs.</span>}
        {mine.map(e => (
          <form key={e.id} action={removeEnrollment} className="flex items-center gap-2 rounded-xl bg-soft py-1.5 pl-3 pr-1.5 text-[12px] font-bold">
            {ws.courses.find(c => c.id === e.course_id)?.title ?? "Curs"}
            {e.status !== "active" && <Pill tone="gray">{e.status === "paused" ? "Pauză" : "Încheiat"}</Pill>}
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton className="rounded-lg px-2 py-0.5 text-muted hover:bg-white hover:text-[#c03a3a]">×</SubmitButton>
          </form>
        ))}
      </div>
      {available.length > 0 && (
        <form action={enrollStudent} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="student_id" value={student.id} />
          <select name="course_id" className="tf-input w-auto min-w-[200px]" required defaultValue="">
            <option value="" disabled>Alege un curs…</option>
            {available.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <SubmitButton className="tf-btn-ghost">Înscrie</SubmitButton>
        </form>
      )}
    </div>
  );
}
