import Link from "next/link";
import { Archive, ArchiveRestore, BarChart3, Copy, GitBranch, Pencil, Plus, Search, Sparkles, Users } from "lucide-react";
import { Card, DemoNotice, EmptyState, PageHeader, Pill, Tabs } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { PendingMigration } from "@/components/PendingMigration";
import { loadWorkspace } from "@/lib/data/workspace";
import { loadTeacherQuizzes } from "@/lib/data/quizzes";
import { deleteQuiz, duplicateQuiz, setQuizStatus } from "@/lib/actions/quizzes";
import { STATUS_LABEL, STATUS_TONE, percent } from "@/lib/quiz";
import { formatDate } from "@/lib/time";
import { getT } from "@/lib/i18n/server";
import type { QuizStatus } from "@/types/database";

type Params = { q?: string; status?: string; subject?: string; course?: string; period?: string };

const tone = (p: number | null) => (p == null ? "gray" : p >= 80 ? "green" : p >= 50 ? "amber" : "red") as "gray" | "green" | "amber" | "red";
const PERIODS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "365": 365 };

/** Test library: search, filters, statuses and the actions on each test. */
export default async function QuizzesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, data, t, sp] = await Promise.all([loadWorkspace(), loadTeacherQuizzes(), getT(), searchParams]);
  const demo = ws.mode === "demo";
  const course = new Map(ws.courses.map(c => [c.id, c]));
  const status = (["draft", "published", "finished", "archived"] as const).find(s => s === sp.status);
  const query = (sp.q ?? "").trim().toLowerCase();
  const since = sp.period && PERIODS[sp.period] ? new Date().getTime() - PERIODS[sp.period] * 86400000 : null;
  const subjects = [...new Set(data.quizzes.map(q => q.subject?.trim()).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));

  const list = data.quizzes.filter(q =>
    (status ? q.status === status : q.status !== "archived") &&
    (!query || [q.title, q.topic, q.subject].some(x => x?.toLowerCase().includes(query))) &&
    (!sp.subject || q.subject === sp.subject) &&
    (!sp.course || q.course_id === sp.course) &&
    (!since || new Date(q.updated_at).getTime() >= since));
  const of = (id: string) => data.assignments.filter(a => a.quiz_id === id);
  const count = (s?: QuizStatus) => data.quizzes.filter(q => (s ? q.status === s : q.status !== "archived")).length;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, subject: sp.subject, course: sp.course, period: sp.period, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/quizzes${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader title={t("Teste AI")} subtitle={t("Creează teste cu AI, publică-le elevilor și vezi rezultatele corectate automat.")}
        action={data.ready && <Link href="/quizzes/new" className="tf-btn"><Sparkles className="h-4 w-4" /> {t("Creează test cu AI")}</Link>} />
      {!data.ready && <PendingMigration file="0014" />}

      {data.ready && (
        <>
          <Tabs active={status ?? "all"} items={[
            { key: "all", label: t("Toate"), href: keep({ status: undefined }), count: count() },
            ...(["draft", "published", "finished", "archived"] as const).map(s => ({ key: s, label: t(STATUS_LABEL[s]), href: keep({ status: s }), count: count(s) }))
          ]} />
          <form className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]" action="/quizzes">
            {status && <input type="hidden" name="status" value={status} />}
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={sp.q} className="tf-input pl-9" placeholder={t("Caută după titlu, temă sau disciplină")} aria-label={t("Caută")} />
            </label>
            <select name="subject" defaultValue={sp.subject ?? ""} className="tf-input" aria-label={t("Disciplina")}>
              <option value="">{t("Toate disciplinele")}</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select name="course" defaultValue={sp.course ?? ""} className="tf-input" aria-label={t("Grupa")}>
              <option value="">{t("Toate grupele")}</option>
              {ws.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select name="period" defaultValue={sp.period ?? ""} className="tf-input" aria-label={t("Perioada")}>
              <option value="">{t("Oricând")}</option>
              <option value="7">{t("Ultimele 7 zile")}</option>
              <option value="30">{t("Ultimele 30 de zile")}</option>
              <option value="90">{t("Ultimele 3 luni")}</option>
              <option value="365">{t("Ultimul an")}</option>
            </select>
            <button className="tf-btn-ghost">{t("Filtrează")}</button>
          </form>
        </>
      )}

      {data.ready && data.quizzes.length === 0 && (
        <EmptyState icon={Sparkles} title={t("Niciun test încă")}
          text={t("Descrie testul pe care îl vrei, iar AI-ul creează întrebările, răspunsurile și explicațiile. Tu le verifici și le publici elevilor.")}
          action={<Link href="/quizzes/new" className="tf-btn"><Sparkles className="h-4 w-4" /> {t("Creează primul test")}</Link>} />
      )}
      {data.ready && data.quizzes.length > 0 && list.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-[13px] text-muted shadow-card">{t("Niciun test nu corespunde filtrelor.")}</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map(q => {
          const as = of(q.id);
          const done = as.filter(a => a.status === "submitted");
          const pcs = done.map(a => percent(a.score, a.max_score)).filter((p): p is number => p != null);
          const avg = pcs.length ? Math.round(pcs.reduce((s, p) => s + p, 0) / pcs.length) : null;
          const review = as.filter(a => a.needs_review).length;
          return (
            <Card key={q.id} className="flex h-full flex-col p-4">
              <Link href={`/quizzes/${q.id}`} className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint text-primary-2"><Sparkles className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-[13px] font-extrabold text-ink">{q.title}</h4>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {[q.subject, q.course_id ? course.get(q.course_id)?.title : null, t.n("{n} întrebare|{n} întrebări|{n} de întrebări", q.questions.length)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Pill tone={STATUS_TONE[q.status]}>{t(STATUS_LABEL[q.status])}</Pill>
                  {q.version > 1 && <span className="text-[10px] font-bold text-muted">v{q.version}</span>}
                </span>
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-muted">
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {as.length ? t("{done} din {total} au rezolvat", { done: done.length, total: as.length }) : t("Nepublicat încă")}</span>
                {avg != null && <Pill tone={tone(avg)}>{t("media {n}%", { n: avg })}</Pill>}
                {review > 0 && <Pill tone="amber">{t("{n} de verificat", { n: review })}</Pill>}
                <span className="ml-auto font-semibold">{formatDate(q.updated_at, ws.timezone, t.locale)}</span>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line pt-3 [&>*]:shrink-0" style={{ marginTop: "12px" }}>
                <Link href={`/quizzes/${q.id}`} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-primary-2 hover:bg-soft"><BarChart3 className="h-3.5 w-3.5" /> {t("Rezultate")}</Link>
                <Link href={`/quizzes/${q.id}/edit`} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-muted hover:bg-soft hover:text-ink"><Pencil className="h-3.5 w-3.5" /> {t("Editează")}</Link>
                <form action={duplicateQuiz}><input type="hidden" name="id" value={q.id} />
                  <SubmitButton className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-muted hover:bg-soft hover:text-ink"><Copy className="h-3.5 w-3.5" /> {t("Duplică")}</SubmitButton>
                </form>
                <form action={duplicateQuiz}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="mode" value="version" />
                  <SubmitButton className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-muted hover:bg-soft hover:text-ink"><GitBranch className="h-3.5 w-3.5" /> {t("Versiune nouă")}</SubmitButton>
                </form>
                <form action={setQuizStatus}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="status" value={q.status === "archived" ? "published" : "archived"} />
                  <SubmitButton className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-muted hover:bg-soft hover:text-ink">
                    {q.status === "archived" ? <><ArchiveRestore className="h-3.5 w-3.5" /> {t("Restaurează")}</> : <><Archive className="h-3.5 w-3.5" /> {t("Arhivează")}</>}
                  </SubmitButton>
                </form>
                <form action={deleteQuiz} className="ml-auto"><input type="hidden" name="id" value={q.id} /><ConfirmSubmit label={t("Șterge")} confirm={t("Confirmă")} className="px-2 py-1 text-[11px]" /></form>
              </div>
            </Card>
          );
        })}
      </div>

      {data.ready && data.quizzes.length > 0 && (
        <Link href="/quizzes/new" className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-bold text-primary-2"><Plus className="h-4 w-4" /> {t("Test nou")}</Link>
      )}
      {demo && <DemoNotice />}
    </div>
  );
}
