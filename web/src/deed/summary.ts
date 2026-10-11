import { formatIsoDate, istDateOf } from "../format/dates";
import { formatRupees } from "../format/money";
import type { Agreement } from "../lib/types";
import { firstName } from "../room/words";
import { hoursInWords, numberWord } from "./blanks";

export interface SummaryFacts {
  maker: string | null;
  client: string | null;
  organisation: string | null;
  work: string | null;
  totalPaise: number | null;
  parts: number;
  lastDue: string | null;
  reviewDays: number;
  bufferHours: number;
}

/** The plain-language summary at the top of every deed, filled from the terms. */
export function summaryText(f: SummaryFacts): string {
  const maker = f.maker || "The Maker";
  const client = f.client ? `${f.client}${f.organisation ? ` of ${f.organisation}` : ""}` : "the Client";
  const work = f.work || "the work";
  const parts = f.parts > 1 ? `in ${numberWord(f.parts)} parts` : f.parts === 1 ? "in one part" : "in parts still to be set";
  const by = f.lastDue ? `, by ${formatIsoDate(f.lastDue)}` : "";
  const price = f.totalPaise ? `, for ${formatRupees(f.totalPaise)}` : "";
  const payer = firstName(f.client) || "the Client";
  const payee = firstName(f.maker) || "the Maker";
  const opening = payer.charAt(0).toUpperCase() + payer.slice(1);
  return (
    `${maker} will deliver ${work} to ${client}, ${parts}${by}${price}. ` +
    `${opening} pays it all at the start; Razorpay holds it, and each part goes to ${payee} when ${payer} approves it, ` +
    `or ${hoursInWords(f.bufferHours)} after its ${numberWord(f.reviewDays)}-day review ends if ${payer} says nothing.`
  );
}

export function agreementSummary(a: Agreement): string {
  const last = a.milestones[a.milestones.length - 1];
  return summaryText({
    maker: a.maker.name,
    client: a.client.name,
    organisation: a.client.organisation,
    work: a.work.description,
    totalPaise: Number(a.money.total_paise),
    parts: a.milestones.length,
    lastDue: last ? istDateOf(last.due_at) : null,
    reviewDays: a.policy.review_window_days,
    bufferHours: a.policy.hold_buffer_hours,
  });
}
