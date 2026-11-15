"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FILE_ACCEPT, FILES_BUCKET, MAX_FILE_BYTES, MAX_FILES, formatSize, isImage, storageName, type FileRef } from "@/lib/files";
import { newId } from "@/lib/board/model";
import { useT } from "@/lib/i18n/client";

/**
 * File picker for forms. Files go straight from the browser to Storage (no size limit from the
 * server action), and the chosen list travels with the form as JSON in a hidden input.
 */
export function FileAttach({ name, folder, initial = [], disabled = false, label }: {
  name: string;
  /** Storage folder, e.g. "hw/<teacher id>" or "sub/<user id>/<homework id>". */
  folder: string;
  initial?: FileRef[];
  disabled?: boolean;
  label?: string;
}) {
  const t = useT();
  const [files, setFiles] = useState<FileRef[]>(initial);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setError("");
    const supabase = createClient();
    if (!supabase) { setError(t("Fișierele nu se pot încărca în modul demonstrativ.")); return; }
    const picked = [...list].slice(0, Math.max(0, MAX_FILES - files.length));
    if (picked.length < list.length) setError(t("Cel mult {n} fișiere.", { n: MAX_FILES }));
    for (const file of picked) {
      if (file.size > MAX_FILE_BYTES) { setError(t("„{name}” e prea mare (maxim 25 MB).", { name: file.name })); continue; }
      setBusy(b => b + 1);
      const path = `${folder}/${storageName(file.name, newId())}`;
      const { error: upErr } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      setBusy(b => b - 1);
      if (upErr) { setError(t("Nu s-a putut încărca „{name}”.", { name: file.name })); continue; }
      setFiles(f => [...f, { path, name: file.name, size: file.size, type: file.type }]);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name={name} value={JSON.stringify(files)} />
      <div className="flex flex-wrap items-center gap-2">
        {files.map(f => (
          <span key={f.path} className="flex max-w-full items-center gap-2 rounded-xl bg-soft py-1.5 pl-2.5 pr-1.5 text-[12px] font-bold">
            {isImage(f) ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="truncate">{f.name}</span>
            {f.size > 0 && <span className="shrink-0 text-[10px] font-semibold text-muted">{formatSize(f.size)}</span>}
            <button type="button" onClick={() => setFiles(list => list.filter(x => x.path !== f.path))} aria-label={t("Scoate „{name}”", { name: f.name })}
              className="grid h-5 w-5 cursor-pointer place-items-center rounded-md text-muted hover:bg-white hover:text-[#c03a3a]"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <label className={`flex items-center gap-2 rounded-xl border border-dashed border-[#c9cfee] px-3 py-2 text-[12px] font-bold text-primary-2 ${disabled || files.length >= MAX_FILES ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary hover:bg-soft"}`}>
          {busy > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {busy > 0 ? t("Se încarcă…") : label ?? t("Atașează fișiere")}
          <input ref={inputRef} type="file" multiple accept={FILE_ACCEPT} disabled={disabled || busy > 0 || files.length >= MAX_FILES} className="sr-only"
            onChange={e => { void add(e.target.files); }} />
        </label>
        <span className="text-[10px] text-muted">{t("Poze, PDF, Word, PowerPoint, Excel · până la 25 MB")}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-[#c03a3a]">{error}</p>}
    </div>
  );
}
