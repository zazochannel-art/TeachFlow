/**
 * Supabase's Data API returns at most "Max rows" rows per request (1000 unless the project changed
 * it), whatever `.limit()` asks for: `.limit(5000)` silently returns 1000. Every read that can
 * need more rows than that goes through these helpers.
 */
export const PAGE_ROWS = 1000;

export interface Rows<T> { data: T[] | null; error: { message: string; code?: string } | null }

/**
 * Reads up to `max` rows, one page after the other. `page(from, to)` builds the query with
 * `.range(from, to)`; it must be ordered, with a unique column last (usually `id`), so pages
 * neither overlap nor skip rows. Stops at the first page that is not full. Any failed page fails
 * the whole read (callers treat a failure the same way as before: missing table, no access…).
 */
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<Rows<T>>, max = 50_000, size = PAGE_ROWS): Promise<Rows<T>> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += size) {
    const to = Math.min(from + size, max) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: null, error };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}

/**
 * `.in(column, ids)` puts every id in the URL; a few hundred ids make it too long for the API.
 * Runs `query` for groups of `size` ids (a few at a time) and joins the rows.
 */
export async function readByIds<T, Id extends string = string>(ids: readonly Id[], query: (chunk: Id[]) => PromiseLike<Rows<T>>, size = 150): Promise<Rows<T>> {
  const unique = [...new Set(ids)];
  const chunks: Id[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  const rows: T[] = [];
  for (let i = 0; i < chunks.length; i += 4) {
    const results = await Promise.all(chunks.slice(i, i + 4).map(c => query(c)));
    for (const r of results) {
      if (r.error) return { data: null, error: r.error };
      rows.push(...(r.data ?? []));
    }
  }
  return { data: rows, error: null };
}
