import { formatCalendarDate } from "../format/dates";
import {
  addDays,
  addMonths,
  type CalendarDate,
  compareDates,
  daysBetween,
  endOfMonth,
  fromIsoDate,
  isValidDate,
  toIsoDate,
  weekday,
} from "./calendar";
import { findFestival } from "./festivals";
import { wholeNumber } from "./numbers";
import { prepare } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

export interface DateContext {
  today: CalendarDate;
  maxDays: number;
}

export const DATE_UNREADABLE = "Couldn't read a date here. Try 'Friday tak', '17 Oct' or '10 din mein'.";
const DATE_PAST = "That date has already passed. Pick today or a day after it.";

export function dateLimitNote(maxDays: number): string {
  return `A deal on Vaada can run at most ${maxDays} days from today, which keeps every possible refund inside the banks' six-month window.`;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  janvari: 1,
  janwari: 1,
  feb: 2,
  february: 2,
  farvari: 2,
  farwari: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  aprail: 4,
  may: 5,
  mai: 5,
  jun: 6,
  june: 6,
  joon: 6,
  jul: 7,
  july: 7,
  julai: 7,
  aug: 8,
  august: 8,
  agast: 8,
  sep: 9,
  sept: 9,
  september: 9,
  sitambar: 9,
  oct: 10,
  october: 10,
  aktubar: 10,
  oktubar: 10,
  nov: 11,
  november: 11,
  navambar: 11,
  dec: 12,
  december: 12,
  disambar: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  ravivar: 0,
  ravivaar: 0,
  itvaar: 0,
  itwaar: 0,
  itvar: 0,
  etvar: 0,
  monday: 1,
  mon: 1,
  somvar: 1,
  somvaar: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  mangalvar: 2,
  mangalvaar: 2,
  mangal: 2,
  wednesday: 3,
  wed: 3,
  budhvar: 3,
  budhvaar: 3,
  budh: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  guruvar: 4,
  guruvaar: 4,
  brihaspativar: 4,
  veervar: 4,
  friday: 5,
  fri: 5,
  shukravar: 5,
  shukravaar: 5,
  shukra: 5,
  saturday: 6,
  sat: 6,
  shanivar: 6,
  shanivaar: 6,
  shani: 6,
};

/** Connective words around a date that carry no meaning for it. */
const CONNECTIVES =
  /\b(tak|takk|ko|pe|par|by|on|till|until|upto|up to|the|of|deadline|due|within|in|mein|me|andar|ke|ka|ki|date|se|tak mein|latest|at the latest|sabse late)\b/g;
const BEFORE = /\b(se pehle|se pahle|pehle|pahle|before)\b/;
const AFTER = /\b(ke baad|ke bad|baad|bad|after)\b/;

interface Reading {
  date: CalendarDate;
  note?: string;
}

function nextWeekday(today: CalendarDate, target: number, includeToday: boolean): CalendarDate {
  let delta = (target - weekday(today) + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDays(today, delta);
}

function weekdayInNextWeek(today: CalendarDate, target: number): CalendarDate {
  const daysSinceMonday = (weekday(today) + 6) % 7;
  const nextMonday = addDays(today, 7 - daysSinceMonday);
  return addDays(nextMonday, (target + 6) % 7);
}

function nextOccurrence(today: CalendarDate, month: number, day: number): CalendarDate | undefined {
  for (const y of [today.y, today.y + 1]) {
    if (!isValidDate(y, month, day)) continue;
    const c = { y, m: month, d: day };
    if (compareDates(c, today) >= 0) return c;
  }
  return undefined;
}

function dayNumber(word: string): number | undefined {
  const m = /^(\d{1,2})(st|nd|rd|th)?$/.exec(word);
  if (m) return Number(m[1]);
  const n = wholeNumber(word);
  return n !== undefined && n >= 1 && n <= 31 ? n : undefined;
}

function fullYear(word: string | undefined): number | undefined {
  if (!word) return undefined;
  const y = Number(word.replace(/^'/, ""));
  if (!Number.isInteger(y)) return undefined;
  return y < 100 ? 2000 + y : y;
}

function readAbsolute(text: string, today: CalendarDate): Reading | undefined | "invalid" {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isValidDate(y, m, d) ? { date: { y, m, d } } : "invalid";
  }

  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (numeric) {
    const [d, m] = [Number(numeric[1]), Number(numeric[2])];
    const y = fullYear(numeric[3]);
    if (y !== undefined) return isValidDate(y, m, d) ? { date: { y, m, d } } : "invalid";
    const next = nextOccurrence(today, m, d);
    return next ? { date: next } : "invalid";
  }

  const words = text.split(" ").filter((w) => w !== "of" && w !== ",");
  const monthIndex = words.findIndex((w) => MONTHS[w.replace(/,$/, "")] !== undefined);
  if (monthIndex >= 0) {
    const month = MONTHS[words[monthIndex]!.replace(/,$/, "")]!;
    const before = words.slice(0, monthIndex).join(" ");
    const after = words.slice(monthIndex + 1).map((w) => w.replace(/,$/, ""));
    let day: number | undefined;
    let yearWord: string | undefined;
    if (before) {
      day = dayNumber(before);
      yearWord = after[0];
      if (after.length > 1) return undefined;
    } else {
      day = after[0] ? dayNumber(after[0]) : undefined;
      yearWord = after[1];
      if (after.length > 2) return undefined;
    }
    if (day === undefined) return undefined;
    if (yearWord !== undefined && !/^'?\d{2}(\d{2})?$/.test(yearWord)) return undefined;
    const y = fullYear(yearWord);
    if (y !== undefined) return isValidDate(y, month, day) ? { date: { y, m: month, d: day } } : "invalid";
    const next = nextOccurrence(today, month, day);
    return next ? { date: next } : "invalid";
  }

  const bareDay = /^(\S+?)(?:st|nd|rd|th)?(?: (tareekh|tarikh|taarikh|tarik|tareek))?$/.exec(text);
  if (bareDay) {
    const day = dayNumber(bareDay[1]!);
    if (day === undefined) return undefined;
    for (let offset = 0; offset < 3; offset++) {
      const c = addMonths({ y: today.y, m: today.m, d: 1 }, offset);
      if (isValidDate(c.y, c.m, day) && compareDates({ ...c, d: day }, today) >= 0) {
        return { date: { ...c, d: day } };
      }
    }
  }
  return undefined;
}

function readRelative(text: string, today: CalendarDate): Reading | undefined {
  if (/^(aaj|aj|today)$/.test(text)) return { date: today };
  if (/^(kal|tomorrow|tmrw|kal tak)$/.test(text)) return { date: addDays(today, 1) };
  if (/^(parson|parso|parsoon|day after tomorrow)$/.test(text)) return { date: addDays(today, 2) };

  const countUnit = /^(?:(.+?) )?(din|dino|dinon|days?|hafte|hafta|haftey|hafton|weeks?|mahine|mahina|mahino|mahinon|months?)$/.exec(
    text,
  );
  if (countUnit) {
    const countWords = countUnit[1];
    const unit = countUnit[2]!;
    if (countWords && /^(agle|agla|next|aane wale|coming)$/.test(countWords)) {
      if (/^(hafte|hafta|haftey|weeks?)$/.test(unit)) {
        const date = addDays(today, 7);
        return { date, note: `Read "next week" as a week from today, ${formatCalendarDate(date)}.` };
      }
      if (/^(mahine|mahina|months?)$/.test(unit)) {
        const date = addMonths(today, 1);
        return { date, note: `Read "next month" as a month from today, ${formatCalendarDate(date)}.` };
      }
      return undefined;
    }
    if (countWords && /^(is|this|iss)$/.test(countWords)) {
      if (/^(hafte|hafta|haftey|weeks?)$/.test(unit)) {
        const date = nextWeekday(today, 0, true);
        return { date, note: `Read "this week" as the coming Sunday, ${formatCalendarDate(date)}.` };
      }
      if (/^(mahine|mahina|months?)$/.test(unit)) return { date: endOfMonth(today) };
      return undefined;
    }
    const n = countWords === undefined || /^(a|an|one|ek)$/.test(countWords) ? 1 : wholeNumber(countWords);
    if (n !== undefined && n > 0) {
      if (/^(din|dino|dinon|days?)$/.test(unit)) return { date: addDays(today, n) };
      if (/^(hafte|hafta|haftey|hafton|weeks?)$/.test(unit)) return { date: addDays(today, 7 * n) };
      return { date: addMonths(today, n) };
    }
  }

  const monthEnd =
    /^(?:(?:agle|agla|next|is|this) )?(?:mahine|mahina|month)(?:'s)? (?:end|aakhir|akhir|ant)$|^end (?:(?:next|this) )?(?:mahine|mahina|month)$|^(?:(?:agle|agla|next|is|this) )?month-?end$/;
  if (monthEnd.test(text)) {
    const nextMonth = /\b(agle|agla|next)\b/.test(text);
    return { date: endOfMonth(nextMonth ? addMonths(today, 1) : today) };
  }

  const day = /^(?:(agle|agla|agli|next|is|this|iss|aane wale|coming) )?(\S+)$/.exec(text);
  if (day) {
    const target = WEEKDAYS[day[2]!];
    if (target === undefined) return undefined;
    const qualifier = day[1];
    if (qualifier && /^(agle|agla|agli|next)$/.test(qualifier)) {
      const date = weekdayInNextWeek(today, target);
      return { date, note: `Read "next ${day[2]}" as ${formatCalendarDate(date)}.` };
    }
    if (qualifier && /^(is|this|iss|aane wale|coming)$/.test(qualifier)) {
      return { date: nextWeekday(today, target, true) };
    }
    const date = nextWeekday(today, target, false);
    if (weekday(today) === target) return { date, note: `Today is ${day[2]}, so this reads as a week from today.` };
    return { date };
  }
  return undefined;
}

function readFestival(text: string, today: CalendarDate, shift: number): Reading | undefined {
  const festival = findFestival(text);
  if (!festival) return undefined;
  const upcoming = festival.dates.map(fromIsoDate).find((c) => compareDates(addDays(c, shift), today) >= 0);
  if (!upcoming) return undefined;
  const date = addDays(upcoming, shift);
  const when =
    shift < 0 ? `the day before ${festival.name}, ` : shift > 0 ? `the day after ${festival.name}, ` : "";
  return {
    date,
    note: `Read this as ${when}${formatCalendarDate(date)}. ${festival.name} falls on ${formatCalendarDate(upcoming)} by our calendar; check it.`,
  };
}

function read(text: string, today: CalendarDate): Reading | undefined | "invalid" {
  const shift = BEFORE.test(text) ? -1 : AFTER.test(text) ? 1 : 0;
  const stripped = text.replace(BEFORE, " ").replace(AFTER, " ");
  const festival = readFestival(stripped, today, shift);
  if (festival) return festival;

  const core = stripped.replace(CONNECTIVES, " ").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  if (!core) return undefined;
  const reading = readRelative(core, today) ?? readAbsolute(core, today);
  if (!reading || reading === "invalid" || shift === 0) return reading;
  const date = addDays(reading.date, shift);
  return { date, note: `Read this as ${formatCalendarDate(date)}, a day ${shift < 0 ? "before" : "after"} the date you named.` };
}

/** Returns an ISO calendar date (YYYY-MM-DD), always read against today in Asia/Kolkata. */
export function date(raw: string, ctx: DateContext): Normalized<string> {
  const { text, corrected, previous } = prepare(raw);
  if (!text) return failed(DATE_UNREADABLE);

  let reading: Reading | undefined | "invalid";
  if (corrected && previous) {
    const day = dayNumber(text.replace(CONNECTIVES, " ").trim());
    const before = day === undefined ? undefined : read(previous, ctx.today);
    if (day !== undefined && before && before !== "invalid" && isValidDate(before.date.y, before.date.m, day)) {
      const c = { ...before.date, d: day };
      reading = { date: c, note: `Read the correction as ${formatCalendarDate(c)}, in the month you said first.` };
    }
  }
  reading ??= read(text, ctx.today);
  if (reading === "invalid") return failed("That isn't a real date. Check the day and the month.");
  if (!reading) return failed(DATE_UNREADABLE);

  const { date: c, note } = reading;
  if (compareDates(c, ctx.today) < 0) return failed(DATE_PAST);
  if (daysBetween(ctx.today, c) > ctx.maxDays) return failed(dateLimitNote(ctx.maxDays));
  return note ? inferred(toIsoDate(c), note) : exact(toIsoDate(c));
}
