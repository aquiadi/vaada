import { formatIsoDate } from "../format/dates";
import { formatRupees } from "../format/money";
import { amount, count, date, email, organisation, personName, plan, work, type CalendarDate, type Normalized, type PlanValue } from "../normalize";
import { fromIsoDate } from "../normalize/calendar";
import { percent } from "../normalize/percent";

export type BlankKind = "name" | "org" | "work" | "count" | "amount" | "plan" | "date" | "days" | "percent" | "text" | "email";

export interface BlankDef {
  key: string;
  kind: BlankKind;
  /** What a screen reader says: "Client's name", never "blank". */
  label: string;
  placeholder: string;
  minCh: number;
}

export const STRIKABLE = ["client_organisation", "late_fee", "kill_fee", "ip_transfer"] as const;
export type StrikableKey = (typeof STRIKABLE)[number];

const FIXED: BlankDef[] = [
  { key: "maker_name", kind: "name", label: "Your name, the Maker", placeholder: "your name", minCh: 12 },
  { key: "client_name", kind: "name", label: "Client's name", placeholder: "client's name", minCh: 12 },
  { key: "client_organisation", kind: "org", label: "Client's organisation", placeholder: "their organisation", minCh: 14 },
  { key: "work", kind: "work", label: "The work you'll deliver", placeholder: "the work", minCh: 22 },
  { key: "revisions", kind: "count", label: "Number of revision rounds", placeholder: "how many", minCh: 8 },
  { key: "total", kind: "amount", label: "Total amount", placeholder: "total", minCh: 9 },
  { key: "plan", kind: "plan", label: "Payment plan", placeholder: "how it's split", minCh: 18 },
  { key: "late_fee.days", kind: "days", label: "Late fee: days of waiting", placeholder: "how many days", minCh: 10 },
  { key: "late_fee.amount", kind: "amount", label: "Late fee amount per week", placeholder: "amount", minCh: 8 },
  { key: "kill_fee.percent", kind: "percent", label: "Kill fee percentage", placeholder: "percent", minCh: 7 },
  { key: "ip_transfer.exclusions", kind: "text", label: "What the Maker keeps rights to", placeholder: "what you keep", minCh: 20 },
];

export function milestoneBlanks(i: number): BlankDef[] {
  return [
    { key: `milestones.${i}.title`, kind: "text", label: `Part ${i}: name`, placeholder: "name of the part", minCh: 10 },
    { key: `milestones.${i}.amount`, kind: "amount", label: `Part ${i}: amount`, placeholder: "amount", minCh: 8 },
    { key: `milestones.${i}.deliverables`, kind: "text", label: `Part ${i}: what's delivered`, placeholder: "what's delivered", minCh: 18 },
    { key: `milestones.${i}.due`, kind: "date", label: `Part ${i}: due date`, placeholder: "due date", minCh: 12 },
  ];
}

export function blankDef(key: string): BlankDef {
  const fixed = FIXED.find((b) => b.key === key);
  if (fixed) return fixed;
  const m = /^milestones\.(\d+)\./.exec(key);
  if (m) {
    const found = milestoneBlanks(Number(m[1])).find((b) => b.key === key);
    if (found) return found;
  }
  throw new Error(`Unknown blank ${key}`);
}

/** Which blanks must be filled (or their clause struck) before the deed can go out. */
export function requiredBlanks(milestoneCount: number, struck: readonly string[]): string[] {
  const keys = ["maker_name", "client_name", "work", "revisions", "total", "plan"];
  if (!struck.includes("client_organisation")) keys.push("client_organisation");
  if (!struck.includes("late_fee")) keys.push("late_fee.days", "late_fee.amount");
  if (!struck.includes("kill_fee")) keys.push("kill_fee.percent");
  if (!struck.includes("ip_transfer")) keys.push("ip_transfer.exclusions");
  for (let i = 1; i <= milestoneCount; i++) keys.push(...milestoneBlanks(i).map((b) => b.key));
  return keys;
}

export interface NormalizeContext {
  today: CalendarDate;
  maxDays: number;
  totalPaise: number | null;
}

export function normalizeBlank(kind: BlankKind, raw: string, ctx: NormalizeContext): Normalized<unknown> {
  switch (kind) {
    case "name":
      return personName(raw);
    case "org":
      return organisation(raw);
    case "work":
      return work(raw);
    case "count":
      return count(raw);
    case "days":
      return count(raw, { unit: "days" });
    case "amount":
      return amount(raw);
    case "percent":
      return percent(raw);
    case "plan":
      return plan(raw, { totalPaise: ctx.totalPaise });
    case "date":
      return date(raw, { today: ctx.today, maxDays: ctx.maxDays });
    case "email":
      return email(raw);
    case "text": {
      const text = raw.trim().replace(/[.!?।]+$/u, "").trim();
      return text ? { value: text, confidence: "exact" } : { value: null, confidence: "failed", note: "Fill this in." };
    }
  }
}

const SMALL = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];

export function numberWord(n: number): string {
  return SMALL[n] ?? String(n);
}

function shareText(share: PlanValue["parts"][number]["share"]): string {
  switch (share.type) {
    case "percent":
      return `${share.bps % 100 === 0 ? share.bps / 100 : (share.bps / 100).toFixed(2)}%`;
    case "amount":
      return formatRupees(share.paise);
    case "rest":
      return "the rest";
    case "equal":
      return "an equal share";
  }
}

export function describePlan(value: PlanValue): string {
  const parts = value.parts;
  if (parts.length === 1) return `all of it ${parts[0]!.stage === "advance" ? "in advance" : "on delivery"}`;
  if (parts.every((p) => p.share.type === "equal")) return `in ${numberWord(parts.length)} equal parts`;
  return parts.map((p) => `${shareText(p.share)} ${p.title === "Advance" ? "in advance" : p.title.toLowerCase()}`).join(", ");
}

/** The clean value a blank shows once it has been read. */
export function displayValue(kind: BlankKind, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (kind) {
    case "amount":
      return typeof value === "number" ? formatRupees(value) : "";
    case "date":
      return typeof value === "string" ? formatIsoDate(value) : "";
    case "count":
      return value === "unlimited" ? "unlimited" : typeof value === "number" ? numberWord(value) : "";
    case "days":
      return typeof value === "number" ? `${numberWord(value)} ${value === 1 ? "day" : "days"}` : "";
    case "percent":
      return typeof value === "number" ? `${value}%` : "";
    case "plan":
      return describePlan(value as PlanValue);
    default:
      return String(value);
  }
}

export function isoToCalendar(iso: string): CalendarDate {
  return fromIsoDate(iso);
}
