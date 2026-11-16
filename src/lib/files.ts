// Files stored in the private Supabase Storage bucket (migration 0010).
// Paths: lesson/<lesson_id>/<file>, hw/<teacher_uid>/<file>, sub/<student_uid>/<homework_id>/<file>.

export const FILES_BUCKET = "teachflow-files";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
/** What the file pickers accept: images, PDF, office documents, text, audio. */
export const FILE_ACCEPT = "image/*,application/pdf,.doc,.docx,.odt,.rtf,.txt,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,audio/*";

/**
 * MIME types the files bucket accepts (migration 0016). Anything else is uploaded as
 * application/octet-stream, which browsers always download instead of opening, so an HTML or
 * SVG file can never run as a page.
 */
export const UPLOAD_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif", "image/heic", "image/heif",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf", "text/rtf", "text/plain", "text/csv",
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac"
]);

/** Content type to upload a file with: its own type when allowed, otherwise a plain download. */
export function uploadContentType(type: string | null | undefined): string {
  const base = (type ?? "").split(";")[0].trim().toLowerCase();
  return UPLOAD_TYPES.has(base) ? base : "application/octet-stream";
}

export interface FileRef {
  path: string;
  name: string;
  size: number;
  type: string;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SAFE_FILE = "[A-Za-z0-9._-]{1,140}";
export const LESSON_FILE_RE = new RegExp(`^lesson/${UUID}/${SAFE_FILE}$`, "i");

/** Storage-safe object name that keeps the original extension, e.g. "3f9c1a2b-tema-pag-42.pdf". */
export function storageName(original: string, id: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const base = (dot > 0 ? original.slice(0, dot) : original)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "fisier";
  return `${id.slice(0, 8)}-${base}${ext ? `.${ext}` : ""}`;
}

export function isImage(f: { type?: string; name?: string; path?: string }) {
  if (f.type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.name ?? f.path ?? "");
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Validates an attachment list from a form (JSON) or the database. Only paths under
 * `prefix` are kept, so a form can never point at someone else's files.
 */
export function parseFileRefs(raw: unknown, prefix: string): FileRef[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw || "[]"); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  const out: FileRef[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.path !== "string" || !f.path.startsWith(prefix) || f.path.length > 300 || f.path.includes("..") || seen.has(f.path)) continue;
    seen.add(f.path);
    out.push({
      path: f.path,
      name: typeof f.name === "string" && f.name.trim() ? f.name.slice(0, 160) : f.path.split("/").pop()!,
      size: typeof f.size === "number" && Number.isFinite(f.size) ? Math.max(0, Math.round(f.size)) : 0,
      type: typeof f.type === "string" ? f.type.slice(0, 100) : ""
    });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

/** Reads a stored list without a prefix check (rows already passed RLS). */
export const storedFiles = (raw: unknown): FileRef[] => parseFileRefs(raw, "");
