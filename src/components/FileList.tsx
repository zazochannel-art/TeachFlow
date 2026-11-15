import { Download, FileText } from "lucide-react";
import { formatSize, isImage, type FileRef } from "@/lib/files";

/** Attached files as links (signed URLs), with small previews for images. */
export function FileList({ files, links, className = "" }: { files: FileRef[]; links: Record<string, string>; className?: string }) {
  if (!files.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {files.map(f => {
        const href = links[f.path];
        const body = (
          <>
            {isImage(f) && href
              // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset
              ? <img src={href} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
              : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-primary"><FileText className="h-4 w-4" /></span>}
            <span className="min-w-0">
              <span className="block max-w-[200px] truncate text-[12px] font-bold text-ink">{f.name}</span>
              {f.size > 0 && <span className="block text-[10px] text-muted">{formatSize(f.size)}</span>}
            </span>
            {href && <Download className="h-3.5 w-3.5 shrink-0 text-muted" />}
          </>
        );
        const cls = "flex items-center gap-2 rounded-xl bg-soft py-1.5 pl-1.5 pr-3";
        return href
          ? <a key={f.path} href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-tint`}>{body}</a>
          : <span key={f.path} className={`${cls} opacity-60`}>{body}</span>;
      })}
    </div>
  );
}
