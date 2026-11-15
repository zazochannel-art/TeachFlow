import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET, type FileRef } from "@/lib/files";

/**
 * Short-lived download links (1 hour) for files the signed-in user may read.
 * Storage RLS (migration 0010) decides; a file the user may not read simply gets no link.
 */
export async function signFiles(files: FileRef[]): Promise<Record<string, string>> {
  const paths = [...new Set(files.map(f => f.path))];
  if (!paths.length) return {};
  const supabase = await createClient();
  if (!supabase) return {};
  const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(paths, 3600, { download: false });
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  return out;
}

/** Signed links for storage paths (e.g. question images), keyed by path. */
export async function signPaths(paths: Array<string | null | undefined>): Promise<Record<string, string>> {
  return signFiles([...new Set(paths.filter((p): p is string => !!p))].map(path => ({ path, name: path, size: 0, type: "" })));
}
