"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET, formatSize, isImage } from "@/lib/files";
import { useT } from "@/lib/i18n/client";

export interface LessonFile {
  /** Storage path (live) or blob: URL (demo). */
  key: string;
  name: string;
  size: number;
  url?: string;
}

/** Shows the original name: stored names look like "3f9c1a2b-tema-pag-42.pdf". */
const displayName = (stored: string) => stored.replace(/^[0-9a-f]{8}-/i, "");

/** Files uploaded during the lesson (pictures placed on the board are listed here too). */
export function LessonFiles({ lessonId, live, localFiles, version, canDelete, onClose }: {
  lessonId: string;
  live: boolean;
  localFiles: LessonFile[];
  /** Bumped when someone uploads, so the list reloads. */
  version: number;
  canDelete: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [remote, setFiles] = useState<LessonFile[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const files = live ? remote : localFiles.filter(f => !removed.includes(f.key));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const folder = `lesson/${lessonId}`;
      const { data, error: listErr } = await supabase.storage.from(FILES_BUCKET).list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (cancelled) return;
      if (listErr) { setError(t("Nu am putut încărca lista de fișiere.")); setFiles([]); return; }
      const rows = (data ?? []).filter(f => f.id && f.name !== ".emptyFolderPlaceholder");
      const paths = rows.map(f => `${folder}/${f.name}`);
      const signed = paths.length ? (await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
      if (cancelled) return;
      const urls = new Map(signed.filter(s => s.path && s.signedUrl).map(s => [s.path!, s.signedUrl]));
      setFiles(rows.map((f, i) => ({
        key: paths[i],
        name: displayName(f.name),
        size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
        url: urls.get(paths[i]) ?? undefined
      })));
    })();
    return () => { cancelled = true; };
  }, [live, lessonId, version, t]);

  const remove = async (f: LessonFile) => {
    if (!live) { setRemoved(r => [...r, f.key]); return; }
    const supabase = createClient();
    if (!supabase) return;
    const { error: delErr } = await supabase.storage.from(FILES_BUCKET).remove([f.key]);
    if (delErr) { setError(t("Nu s-a putut șterge fișierul.")); return; }
    setFiles(list => list?.filter(x => x.key !== f.key) ?? null);
  };

  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-extrabold text-ink">{t("Fișierele lecției")}</h3>
        <button type="button" onClick={onClose} aria-label={t("Închide")}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted hover:bg-soft"><X className="h-4 w-4" /></button>
      </div>
      {files === null ? (
        <p className="flex items-center gap-2 text-[12px] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Se încarcă…")}</p>
      ) : files.length === 0 ? (
        <p className="text-[12px] text-muted">{t("Încă nu sunt fișiere. Apasă „Adaugă” sau trage un fișier pe tablă.")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {files.map(f => (
            <li key={f.key} className="flex items-center gap-2 rounded-xl bg-soft py-1.5 pl-1.5 pr-1.5">
              {isImage({ name: f.name }) && f.url
                // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or local blob
                ? <img src={f.url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-primary"><FileText className="h-4 w-4" /></span>}
              <span className="min-w-0">
                <span className="block max-w-[180px] truncate text-[12px] font-bold text-ink">{f.name}</span>
                {f.size > 0 && <span className="block text-[10px] text-muted">{formatSize(f.size)}</span>}
              </span>
              {f.url && (
                <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} aria-label={t("Descarcă „{name}”", { name: f.name })}
                  className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white hover:text-primary"><Download className="h-3.5 w-3.5" /></a>
              )}
              {canDelete && (
                <button type="button" onClick={() => void remove(f)} aria-label={t("Șterge „{name}”", { name: f.name })}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted hover:bg-white hover:text-[#c03a3a]"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-[#c03a3a]">{error}</p>}
    </div>
  );
}
