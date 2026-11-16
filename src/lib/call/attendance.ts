// Attendance of a lesson call from its stays (rows of lesson_call_attendance). Pure, unit-tested.

export interface Stay {
  user_id: string;
  role: "teacher" | "student";
  display_name: string;
  joined_at: string;
  last_seen_at: string;
  left_at: string | null;
}

export interface PersonAttendance {
  userId: string;
  name: string;
  role: "teacher" | "student";
  /** time actually in the call, overlapping stays (two tabs) counted once */
  seconds: number;
  firstJoin: string;
  lastSeen: string;
  /** still in the call (heartbeat in the last 90 s) */
  present: boolean;
}

export interface CallSummary {
  people: PersonAttendance[];
  /** from the first join to the last moment anybody was in the call */
  startedAt: string | null;
  endedAt: string | null;
  /** time with at least one person in the call */
  seconds: number;
  /** time with the teacher and at least one student both in the call */
  lessonSeconds: number;
}

const STALE_MS = 90_000;

type Span = [number, number];

function spanOf(s: Stay, now: number): Span {
  const start = Date.parse(s.joined_at);
  const seen = Date.parse(s.last_seen_at);
  const end = s.left_at ? Date.parse(s.left_at) : now - seen > STALE_MS ? seen : now;
  return [start, Math.max(start, end)];
}

/** Sorted, non-overlapping union of spans. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Span[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const total = (spans: Span[]) => spans.reduce((n, [a, b]) => n + (b - a), 0);

/** Overlap of two unions of spans. */
function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}

export function summarizeAttendance(stays: Stay[], now = Date.now()): CallSummary {
  const byUser = new Map<string, Stay[]>();
  for (const s of stays) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const people: PersonAttendance[] = [];
  const spansOf = new Map<string, Span[]>();
  for (const [userId, list] of byUser) {
    const spans = mergeSpans(list.map(s => spanOf(s, now)));
    spansOf.set(userId, spans);
    const latest = list.reduce((x, y) => (Date.parse(y.last_seen_at) > Date.parse(x.last_seen_at) ? y : x));
    people.push({
      userId,
      name: latest.display_name || "—",
      role: latest.role,
      seconds: Math.round(total(spans) / 1000),
      firstJoin: new Date(Math.min(...list.map(s => Date.parse(s.joined_at)))).toISOString(),
      lastSeen: new Date(Math.max(...spans.map(s => s[1]))).toISOString(),
      present: list.some(s => !s.left_at && now - Date.parse(s.last_seen_at) <= STALE_MS)
    });
  }
  people.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "teacher" ? -1 : 1));

  const all = mergeSpans([...spansOf.values()].flat());
  const teacher = mergeSpans(people.filter(p => p.role === "teacher").flatMap(p => spansOf.get(p.userId) ?? []));
  const students = mergeSpans(people.filter(p => p.role === "student").flatMap(p => spansOf.get(p.userId) ?? []));

  return {
    people,
    startedAt: all.length ? new Date(all[0][0]).toISOString() : null,
    endedAt: all.length ? new Date(all[all.length - 1][1]).toISOString() : null,
    seconds: Math.round(total(all) / 1000),
    lessonSeconds: Math.round(total(intersect(teacher, students)) / 1000)
  };
}

/** "1 h 05 min", "12 min", "<1 min" */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return "<1 min";
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}
