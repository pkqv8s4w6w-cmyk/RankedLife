/**
 * Day-key helpers. Everything in the app is bucketed by a local calendar day
 * string 'YYYY-MM-DD', shifted by the user's rollover hour so that logging at
 * 1am still counts toward the night before.
 */

const MS_DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The day key a given instant belongs to, honouring the rollover hour. */
export function dayKeyFor(date: Date, rolloverHour: number): string {
  const shifted = new Date(date.getTime());
  if (shifted.getHours() < rolloverHour) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return toKey(shifted);
}

export function todayKey(rolloverHour = 0): string {
  return dayKeyFor(new Date(), rolloverHour);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from `a` to `b`. Positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const da = fromKey(a);
  const db = fromKey(b);
  // Normalise to noon so daylight-saving shifts can't round the wrong way.
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / MS_DAY);
}

/** Inclusive list of day keys from `start` to `end`. */
export function rangeKeys(start: string, end: string): string[] {
  const out: string[] = [];
  const total = daysBetween(start, end);
  for (let i = 0; i <= total; i++) out.push(addDays(start, i));
  return out;
}

/** Monday-anchored week start, used for the weekly fresh-start reset. */
export function weekStartKey(key: string): string {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(key, -dow);
}

/**
 * Temporal landmarks that reliably spike aspirational behaviour
 * (Dai, Milkman & Riis, 2014). We use them to offer a clean slate.
 */
export function freshStartLabel(key: string): string | null {
  const d = fromKey(key);
  if (d.getMonth() === 0 && d.getDate() === 1) return 'New year';
  if (d.getDate() === 1) return 'New month';
  if (d.getDay() === 1) return 'New week';
  return null;
}

export function shortLabel(key: string): string {
  const d = fromKey(key);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function weekdayLetter(key: string): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][fromKey(key).getDay()];
}
