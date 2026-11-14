/** Rows fetched newest first (so a row cap drops the oldest ones), returned oldest first. */
export function oldestFirst<T>(rows: T[] | null | undefined): T[] {
  return rows ? [...rows].reverse() : [];
}
