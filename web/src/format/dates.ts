import { type CalendarDate, fromIsoDate, weekday } from "../normalize/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Sat 17 Oct 2026" */
export function formatCalendarDate(c: CalendarDate): string {
  return `${WEEKDAYS[weekday(c)]} ${c.d} ${MONTHS[c.m - 1]} ${c.y}`;
}

export function formatIsoDate(iso: string): string {
  return formatCalendarDate(fromIsoDate(iso));
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "the 17th day of October, 2026", the way a deed dates itself. */
export function formatDeedDate(iso: string): string {
  const c = fromIsoDate(iso);
  return `the ${ordinal(c.d)} day of ${LONG_MONTHS[c.m - 1]}, ${c.y}`;
}

const istFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "12 Oct 2026, 14:03 IST" for an instant. Month names come from our list: en-IN writes September as "Sept". */
export function formatInstantIst(isoInstant: string): string {
  const parts = Object.fromEntries(istFormat.formatToParts(new Date(isoInstant)).map((p) => [p.type, p.value]));
  return `${parts.day} ${MONTHS[Number(parts.month) - 1]} ${parts.year}, ${parts.hour}:${parts.minute} IST`;
}

const istDateOnly = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day an instant falls on in India. */
export function istDateOf(isoInstant: string): string {
  return istDateOnly.format(new Date(isoInstant));
}
