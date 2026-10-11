/** A date on the calendar, with no time and no zone. Months are 1 to 12. */
export interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

const DAY_MS = 86_400_000;

function toUtcMs(c: CalendarDate): number {
  return Date.UTC(c.y, c.m - 1, c.d);
}

function fromUtcMs(ms: number): CalendarDate {
  const date = new Date(ms);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(c: CalendarDate, n: number): CalendarDate {
  return fromUtcMs(toUtcMs(c) + n * DAY_MS);
}

export function addMonths(c: CalendarDate, n: number): CalendarDate {
  const index = c.y * 12 + (c.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return { y, m, d: Math.min(c.d, daysInMonth(y, m)) };
}

export function endOfMonth(c: CalendarDate): CalendarDate {
  return { y: c.y, m: c.m, d: daysInMonth(c.y, c.m) };
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return toUtcMs(a) - toUtcMs(b);
}

/** 0 is Sunday. */
export function weekday(c: CalendarDate): number {
  return new Date(toUtcMs(c)).getUTCDay();
}

export function toIsoDate(c: CalendarDate): string {
  return `${String(c.y).padStart(4, "0")}-${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
}

export function fromIsoDate(iso: string): CalendarDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (!isValidDate(c.y, c.m, c.d)) throw new RangeError(`Not a real date: ${iso}`);
  return c;
}
