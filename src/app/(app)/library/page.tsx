import Link from "next/link";
import { ClipboardList, Download, ExternalLink, FileText, ImageIcon, Library, Link2, Pencil, Plus } from "lucide-react";
import { Card, DemoNotice, EmptyState, Field, PageHeader, Panel, Pill } from "@/components/ui";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { FileAttach } from "@/components/FileAttach";
import { PendingMigration } from "@/components/PendingMigration";
import { loadWorkspace } from "@/lib/data/workspace";
import { loadTeacherLibrary } from "@/lib/data/library";
import { signFiles } from "@/lib/data/files";
import { deleteLibraryItem, saveLibraryItem, toggleLibraryShared } from "@/lib/actions/library";
import { formatSize, isImage, storedFiles } from "@/lib/files";
import { colorOf } from "@/lib/data/derive";
import { colorVar } from "@/lib/colors";
import { getT } from "@/lib/i18n/server";
import type { LibraryItem } from "@/types/database";

type Params = { new?: string; edit?: string; c?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [ws, lib, t, sp] = await Promise.all([loadWorkspace(), loadTeacherLibrary(), getT(), searchParams]);
  const demo = ws.mode === "demo";
  const courseFilter = sp.c === "none" || ws.courses.some(c => c.id === sp.c) ? sp.c : undefined;
  const here = `/library${courseFilter ? `?c=${courseFilter}` : ""}`;
  const withQ = (q: string) => `/library?${q}${courseFilter ? `&c=${courseFilter}` : ""}`;
  const items = lib.items.filter(i => !courseFilter || (courseFilter === "none" ? !i.course_id : i.course_id === courseFilter));
  const editing = sp.edit ? lib.items.find(i => i.id === sp.edit) : undefined;
  const adding = sp.new === "link" ? "link" : sp.new ? "file" : null;
  const fileOf = (i: LibraryItem) => (i.kind === "file" ? storedFiles([i.file])[0] : undefined);
  const links = ws.mode === "live" ? await signFiles(items.map(fileOf).filter(f => !!f)) : {};
  const course = new Map(ws.courses.map(c => [c.id, c]));

  // Groups: one per course (in the course order), then materials without a course.
  const groups = [
    ...ws.courses.map(c => ({ key: c.id, title: c.title, color: colorOf(ws, c.id), items: items.filter(i => i.course_id === c.id) })),
    { key: "none", title: t("General (fără curs)"), color: null as string | null, items: items.filter(i => !i.course_id || !course.has(i.course_id)) }
  ].filter(g => g.items.length);

  const courseSelect = (value?: string | null) => (
    <Field label={t("Curs")} htmlFor="course_id">
      <select id="course_id" name="course_id" defaultValue={value ?? (courseFilter && courseFilter !== "none" ? courseFilter : "")} className="tf-input">
        <option value="">{t("General (fără curs)")}</option>
        {ws.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </Field>
  );
  const sharedBox = (checked: boolean) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-soft p-3.5 sm:col-span-2">
      <input type="checkbox" name="shared" defaultChecked={checked} className="mt-0.5 h-4 w-4 accent-[#5269e8]" />
      <span>
        <span className="block text-[13px] font-bold text-ink">{t("Vizibil pentru elevii cursului")}</span>
        <span className="mt-0.5 block text-[12px] text-muted">{t("Elevii înscriși îl găsesc în portal, la „Materiale”. Debifează pentru materiale doar pentru tine.")}</span>
      </span>
    </label>
  );

  return (
    <div>
      <PageHeader title={t("Bibliotecă")} subtitle={t.n("{n} material · refolosește-l la teme și lecții|{n} materiale · refolosește-le la teme și lecții|{n} de materiale · refolosește-le la teme și lecții", lib.items.length)}
        action={lib.ready && <Link href={withQ("new=file")} className="tf-btn"><Plus className="h-4 w-4" /> {t("Adaugă material")}</Link>} />
      {!lib.ready && <PendingMigration />}

      {lib.ready && (adding || editing) && (
        <Panel title={editing ? t("Editează materialul") : t("Material nou")} closeHref={here}
          aside={editing && <form action={deleteLibraryItem}><input type="hidden" name="id" value={editing.id} /><input type="hidden" name="back" value={here} /><ConfirmSubmit label={t("Șterge")} confirm={t("Confirmă")} className="py-1.5" /></form>}>
          {!editing && (
            <div className="mb-4 flex gap-2">
              <Link href={withQ("new=file")} className={`rounded-xl px-3.5 py-2 text-[12px] font-bold ${adding === "file" ? "bg-primary text-white" : "bg-soft text-muted"}`}>{t("Fișiere")}</Link>
              <Link href={withQ("new=link")} className={`rounded-xl px-3.5 py-2 text-[12px] font-bold ${adding === "link" ? "bg-primary text-white" : "bg-soft text-muted"}`}>{t("Link (video, site, document online)")}</Link>
            </div>
          )}
          <ActionForm action={saveLibraryItem} demo={demo} submitLabel={editing ? t("Salvează") : t("Adaugă în bibliotecă")}>
            <input type="hidden" name="back" value={here} />
            <input type="hidden" name="kind" value={editing?.kind ?? adding ?? "file"} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label={t("Titlu")} htmlFor="title" wide>
              <input id="title" name="title" maxLength={160} required={!!editing || adding === "link"} defaultValue={editing?.title} className="tf-input"
                placeholder={adding === "file" && !editing ? t("Opțional · altfel se folosește numele fișierului") : t("ex. Verbe neregulate — fișă")} />
            </Field>
            {(editing?.kind ?? adding) === "link" && (
              <Field label={t("Link")} htmlFor="url" wide><input id="url" name="url" type="url" required defaultValue={editing?.url ?? ""} className="tf-input" placeholder="https://" /></Field>
            )}
            {!editing && adding === "file" && ws.userId && <FileAttach name="files" folder={`lib/${ws.userId}`} label={t("Încarcă fișiere")} />}
            {courseSelect(editing?.course_id)}
            <Field label={t("Descriere")} htmlFor="description" wide><textarea id="description" name="description" rows={2} maxLength={2000} defaultValue={editing?.description ?? ""} className="tf-input" placeholder={t("ex. Pentru lecția 4 · nivel A2")} /></Field>
            {sharedBox(editing ? editing.shared : true)}
          </ActionForm>
        </Panel>
      )}

      {lib.ready && ws.courses.length > 0 && lib.items.length > 0 && (
        <div className="tf-scroll mb-5 flex items-center gap-2 overflow-x-auto pb-1 text-[11px] font-bold">
          <span className="shrink-0 text-muted">{t("Curs")}:</span>
          <Link href="/library" className={`shrink-0 rounded-full px-3 py-1.5 ${!courseFilter ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}>{t("Toate")}</Link>
          {ws.courses.map(c => (
            <Link key={c.id} href={`/library?c=${c.id}`} className={`shrink-0 rounded-full px-3 py-1.5 ${courseFilter === c.id ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}>{c.title}</Link>
          ))}
          <Link href="/library?c=none" className={`shrink-0 rounded-full px-3 py-1.5 ${courseFilter === "none" ? "bg-ink text-white" : "bg-soft text-muted hover:text-ink"}`}>{t("General")}</Link>
        </div>
      )}

      {lib.ready && items.length === 0 && !adding && (
        <EmptyState icon={Library} title={courseFilter ? t("Niciun material aici") : t("Biblioteca e goală")}
          text={t("Încarcă o dată fișele, prezentările și linkurile folosite des. Le atașezi apoi la teme cu un clic, iar elevii le găsesc în portal.")}
          action={<Link href={withQ("new=file")} className="tf-btn">{t("Adaugă primul material")}</Link>} />
      )}

      <div className="space-y-7">
        {groups.map(g => (
          <section key={g.key}>
            <h3 className="mb-3 flex items-center gap-2 text-[14px] font-extrabold text-ink">
              {g.color && <span className="h-2.5 w-2.5 rounded-full bg-[var(--c)]" style={colorVar(g.color)} />}
              {g.title}
              <span className="text-[11px] font-bold text-muted">{g.items.length}</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map(i => {
                const f = fileOf(i);
                const href = i.kind === "link" ? i.url ?? undefined : f ? links[f.path] : undefined;
                const Icon = i.kind === "link" ? Link2 : f && isImage(f) ? ImageIcon : FileText;
                return (
                  <Card key={i.id} className="flex flex-col p-4">
                    <div className="flex items-start gap-3">
                      {f && isImage(f) && href
                        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                        ? <img src={href} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                        : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint text-primary-2"><Icon className="h-[18px] w-[18px]" /></span>}
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-2 text-[13px] font-extrabold text-ink">{i.title}</h4>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {i.kind === "link" ? (i.url ?? "").replace(/^https?:\/\/(www\.)?/, "") : [f?.name !== i.title ? f?.name : null, f?.size ? formatSize(f.size) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    {i.description && <p className="mt-2 line-clamp-2 text-[12px] text-muted">{i.description}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                      <form action={toggleLibraryShared}>
                        <input type="hidden" name="id" value={i.id} /><input type="hidden" name="shared" value={i.shared ? "0" : "1"} />
                        <SubmitButton className="rounded-full" >
                          {i.shared && i.course_id ? <Pill tone="green">{t("Elevii îl văd")}</Pill> : <Pill tone="gray">{t("Doar pentru mine")}</Pill>}
                        </SubmitButton>
                      </form>
                      <span className="ml-auto flex items-center gap-1">
                        {href && <a href={href} target="_blank" rel="noopener noreferrer" title={t("Deschide")} aria-label={t("Deschide")} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink">{i.kind === "link" ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}</a>}
                        {i.kind === "file" && <Link href={`/homework?new=1&lib=${i.id}${i.course_id ? `&course=${i.course_id}` : ""}`} title={t("Folosește la o temă")} aria-label={t("Folosește la o temă")} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink"><ClipboardList className="h-4 w-4" /></Link>}
                        <Link href={withQ(`edit=${i.id}`)} title={t("Editează")} aria-label={t("Editează")} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink"><Pencil className="h-4 w-4" /></Link>
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {demo && <DemoNotice />}
    </div>
  );
}
