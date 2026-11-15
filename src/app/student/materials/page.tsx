import { Download, ExternalLink, FileText, ImageIcon, Library, Link2 } from "lucide-react";
import { Card, DemoNotice, EmptyState } from "@/components/ui";
import { loadStudentPortal } from "@/lib/data/student";
import { loadStudentLibrary } from "@/lib/data/library";
import { signFiles } from "@/lib/data/files";
import { colorOf } from "@/lib/data/derive";
import { colorVar } from "@/lib/colors";
import { formatSize, isImage, storedFiles } from "@/lib/files";
import { getT } from "@/lib/i18n/server";
import { PendingMigration } from "@/components/PendingMigration";

/** Materials the teachers shared with the student's courses (migration 0013). */
export default async function StudentMaterials() {
  const [p, lib, t] = await Promise.all([loadStudentPortal(), loadStudentLibrary(), getT()]);
  const fileOf = (f: unknown) => storedFiles([f])[0];
  const links = p.mode === "live" ? await signFiles(lib.items.filter(i => i.kind === "file").map(i => fileOf(i.file)).filter(f => !!f)) : {};
  const groups = p.courses
    .map(c => ({ id: c.id, title: c.title, color: colorOf(p, c.id), items: lib.items.filter(i => i.course_id === c.id) }))
    .filter(g => g.items.length);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-[24px] font-extrabold tracking-tight">{t("Materiale")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("Fișele, prezentările și linkurile de la profesori, pe cursuri.")}</p>
      <div className="mt-6">
        {!lib.ready && <PendingMigration />}
        {lib.ready && groups.length === 0 && (
          <EmptyState icon={Library} title={t("Încă nu ai materiale")} text={t("Când profesorul adaugă materiale la cursurile tale, le găsești aici.")} />
        )}
        <div className="space-y-7">
          {groups.map(g => (
            <section key={g.id}>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-extrabold">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--c)]" style={colorVar(g.color)} />{g.title}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map(i => {
                  const f = i.kind === "file" ? fileOf(i.file) : undefined;
                  const href = i.kind === "link" ? i.url ?? undefined : f ? links[f.path] : undefined;
                  const Icon = i.kind === "link" ? Link2 : f && isImage(f) ? ImageIcon : FileText;
                  const body = (
                    <>
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint text-primary-2"><Icon className="h-[18px] w-[18px]" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-[13px] font-extrabold text-ink">{i.title}</span>
                        {i.description && <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{i.description}</span>}
                        {f?.size ? <span className="mt-0.5 block text-[10px] text-muted">{formatSize(f.size)}</span> : null}
                      </span>
                      {href && (i.kind === "link" ? <ExternalLink className="h-4 w-4 shrink-0 text-muted" /> : <Download className="h-4 w-4 shrink-0 text-muted" />)}
                    </>
                  );
                  return href
                    ? <a key={i.id} href={href} target="_blank" rel="noopener noreferrer"><Card className="flex items-start gap-3 p-4 transition-colors hover:bg-soft">{body}</Card></a>
                    : <Card key={i.id} className="flex items-start gap-3 p-4 opacity-70">{body}</Card>;
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      {p.mode === "demo" && <DemoNotice />}
    </div>
  );
}
