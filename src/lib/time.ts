// Time helpers that respect the teacher's timezone (profiles.timezone).
// The server may run in UTC, so day boundaries are computed explicitly.

export const DEFAULT_TZ = "Europe/Chisinau";
const LOCALE = "ro-RO";
// Every formatter takes an optional BCP 47 locale (t.locale); Romanian by default.

function partsInTz(instant: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

function offsetMs(instant: Date, tz: string) {
  const p = partsInTz(instant, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to a UTC Date. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const off = offsetMs(new Date(guess), tz);
  let result = guess - off;
  const off2 = offsetMs(new Date(result), tz);
  if (off2 !== off) result = guess - off2;
  return new Date(result);
}

export function isDateKey(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

/** YYYY-MM-DD of an instant in the given timezone. */
export function dateKey(instant: Date, tz: string) {
  const p = partsInTz(instant, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function splitKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function addDays(key: string, days: number) {
  const { y, m, d } = splitKey(key);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: string) {
  const { y, m, d } = splitKey(key);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(key, -weekday);
}

export function dayRange(key: string, tz: string) {
  const { y, m, d } = splitKey(key);
  const next = splitKey(addDays(key, 1));
  return { start: zonedToUtc(y, m, d, 0, 0, tz), end: zonedToUtc(next.y, next.m, next.d, 0, 0, tz) };
}

function noonUtc(key: string) {
  const { y, m, d } = splitKey(key);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** { weekday: "Luni", rest: "9 noiembrie 2026" } */
export function formatDayHeading(key: string, locale = LOCALE) {
  const date = noonUtc(key);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date);
  const rest = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return { weekday: cap(weekday), rest };
}

export function formatShortDay(key: string, locale = LOCALE) {
  const date = noonUtc(key);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
  return { weekday: cap(weekday.replace(".", "")), day: date.getUTCDate() };
}

export function formatTime(iso: string, tz: string, locale = LOCALE) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));
}

export function formatDate(iso: string, tz: string, locale = LOCALE) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
}

export function hourInTz(iso: string, tz: string) {
  return partsInTz(new Date(iso), tz).h;
}

export function formatMoney(amount: number, currency: string, locale = LOCALE) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
