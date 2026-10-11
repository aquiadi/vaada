import { formatRupees } from "../format/money";
import { toRoman } from "../format/roman";
import { parseAmountText } from "./amount";
import { classifyNumberWord, isHalfWord, wholeNumber } from "./numbers";
import { prepare } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

export type StageKind = "advance" | "delivery" | "draft" | "approval" | "instalment" | "part";

export type Share =
  | { type: "percent"; bps: number }
  | { type: "amount"; paise: number }
  | { type: "rest" }
  | { type: "equal"; count: number };

export interface PlanPart {
  title: string;
  stage: StageKind;
  share: Share;
}

export interface MilestoneDraft {
  title: string;
  stage: StageKind;
  amountPaise: number;
}

export interface PlanValue {
  parts: PlanPart[];
  milestones: MilestoneDraft[] | null;
}

export const PLAN_UNREADABLE =
  "Couldn't read a payment plan. Try 'aadha advance aadha delivery pe', or set the parts by hand below.";
export const PLAN_NEEDS_TOTAL = "Fill in the total and this plan will split it.";
const MAX_PARTS = 12;

const STAGE_PATTERNS: ReadonlyArray<readonly [StageKind, RegExp]> = [
  ["draft", /\b(first draft|pehla draft|draft|concepts?|rough)\b/],
  ["approval", /\b(approval|approve|sign ?off|signoff)\b/],
  ["advance", /\b(advance|upfront|up front|pehle|pahle|shuru|start|abhi|booking|signing|kickoff|kick off)\b/],
  [
    "delivery",
    /\b(delivery|deliver|delivered|end|completion|complete|final|handover|launch|baad|bad|last|aakhir|kaam hone|ho jaane|hone ke baad)\b/,
  ],
];

const STAGE_TITLES: Record<StageKind, string> = {
  advance: "Advance",
  delivery: "On delivery",
  draft: "On first draft",
  approval: "On approval",
  instalment: "Instalment",
  part: "Part",
};

const REST = /\b(baaki|baki|bacha hua|bachi hui|baaki ka|rest|remaining|remainder|balance|the other half)\b/;
const QUARTER = /^(chauthai|quarter|one fourth|ek chauthai|a quarter)$/;
const THREE_QUARTERS = /^(teen chauthai|three quarters|three fourths|paun|paune)$/;
const FILLER =
  /\b(pe|par|on|at|in|mein|me|ke|ka|ki|ko|the|payment|payments|paisa|paise|milega|milenge|dena|denge|de denge|doonga|dungi|chahiye|hoga|hogi|se|of|then|after|when|jab|tab|hai|wala|wali|amount|rakam)\b/g;
const FULL_WORDS = /^(poora|pura|poori|puri|full|sab|sab kuch|everything|all|saara|sara|entire|whole|ek saath|100%|100 percent)$/;

function percentBps(text: string): number | undefined {
  const m = /^(.+?)\s*(%|percent|per cent|pratishat|pc)$/.exec(text);
  if (!m) return undefined;
  const raw = m[1]!.trim();
  const numeric = /^\d+(\.\d{1,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : undefined;
  const words = numeric === undefined ? wholeNumber(raw) : undefined;
  const bps = numeric ?? (words !== undefined ? words * 100 : undefined);
  return bps !== undefined && bps > 0 && bps <= 10_000 ? bps : undefined;
}

function stageOf(segment: string): StageKind | undefined {
  for (const [stage, pattern] of STAGE_PATTERNS) if (pattern.test(segment)) return stage;
  return undefined;
}

function stripStages(segment: string): string {
  let out = segment;
  for (const [, pattern] of STAGE_PATTERNS) out = out.replace(new RegExp(pattern.source, "g"), " ");
  return out.replace(FILLER, " ").replace(/\s+/g, " ").trim();
}

interface ShareReading {
  share: Share;
  bareNumber: boolean;
}

function readShare(words: string): ShareReading | undefined {
  if (!words) return undefined;
  if (isHalfWord(words)) return { share: { type: "percent", bps: 5000 }, bareNumber: false };
  if (QUARTER.test(words)) return { share: { type: "percent", bps: 2500 }, bareNumber: false };
  if (THREE_QUARTERS.test(words)) return { share: { type: "percent", bps: 7500 }, bareNumber: false };
  const bps = percentBps(words);
  if (bps !== undefined) return { share: { type: "percent", bps }, bareNumber: false };
  const amount = parseAmountText(words);
  if (amount.ok) {
    return { share: { type: "amount", paise: amount.amount.paise }, bareNumber: amount.amount.biggest === null };
  }
  return undefined;
}

function isShareStart(word: string): boolean {
  if (/^\d/.test(word) || /^₹/.test(word)) return true;
  if (isHalfWord(word) || REST.test(word) || QUARTER.test(word)) return true;
  const token = classifyNumberWord(word);
  return token?.kind === "number" || token?.kind === "adjust" || token?.kind === "half";
}

/** Splits "aadha advance aadha delivery pe" into one segment per share. */
function segments(text: string): string[] {
  const chunks = text
    .split(/,|;|\+|\b(?:aur|and|then|phir|fir|uske baad|followed by|plus)\b/)
    .map((c) => c.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    let current: string[] = [];
    let hasShare = false;
    let hasStage = false;
    for (const word of chunk.split(" ")) {
      const startsShare = isShareStart(word);
      if (startsShare && hasShare && hasStage) {
        out.push(current.join(" "));
        current = [];
        hasShare = false;
        hasStage = false;
      }
      current.push(word);
      if (startsShare) hasShare = true;
      if (stageOf(word)) hasStage = true;
    }
    if (current.length) out.push(current.join(" "));
  }
  return out;
}

function titled(parts: Omit<PlanPart, "title">[]): PlanPart[] {
  const seen = new Map<StageKind, number>();
  for (const p of parts) seen.set(p.stage, (seen.get(p.stage) ?? 0) + 1);
  let index = 0;
  return parts.map((p) => {
    index += 1;
    const repeated = (seen.get(p.stage) ?? 0) > 1 || p.stage === "part" || p.stage === "instalment";
    const title = repeated ? `${STAGE_TITLES[p.stage]} ${toRoman(index)}` : STAGE_TITLES[p.stage];
    return { ...p, title };
  });
}

type ParseResult = { ok: true; parts: PlanPart[]; notes: string[] } | { ok: false };

function parseParts(text: string): ParseResult {
  const full = /^(.+?) (advance|upfront|pehle|delivery|delivery pe|on delivery|end|end mein|completion|final)\b/.exec(text);
  if (full && FULL_WORDS.test(full[1]!.replace(/\b(payment|amount|paisa|paise|rakam|the|fees?)\b/g, " ").replace(/\s+/g, " ").trim())) {
    const stage = stageOf(full[2]!) ?? "delivery";
    return { ok: true, parts: titled([{ stage, share: { type: "percent", bps: 10_000 } }]), notes: [] };
  }
  if (/^(delivery pe|on delivery|delivery par|after delivery|delivery ke baad)$/.test(text)) {
    return { ok: true, parts: titled([{ stage: "delivery", share: { type: "percent", bps: 10_000 } }]), notes: [] };
  }

  const equal =
    /^(?:in )?(\S+(?: \S+)?) (?:barabar |baraabar |equal |same |saman )?(installments?|instalments?|kishton|kishte|kisht|parts?|hisson|hisse|payments?|milestones?|tranches?|baar)(?: mein| me)?$/.exec(
      text,
    );
  if (equal) {
    const count = wholeNumber(equal[1]!.replace(/ (barabar|baraabar|equal|same|saman)$/, ""));
    if (count !== undefined && count >= 2 && count <= MAX_PARTS) {
      const parts = Array.from({ length: count }, () => ({
        stage: "instalment" as StageKind,
        share: { type: "equal", count } as Share,
      }));
      return { ok: true, parts: titled(parts), notes: [] };
    }
  }

  const list = /^(\d{1,3}(?:\.\d{1,2})?)\s*(?:%\s*)?(?:[-/:]\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*)+(?:%|percent)?$/.test(text);
  if (list) {
    const values = text.match(/\d{1,3}(?:\.\d{1,2})?/g)!.map((v) => Math.round(Number(v) * 100));
    if (values.length >= 2 && values.length <= MAX_PARTS) {
      const parts = values.map((bps, i) => ({
        stage: (values.length === 2 ? (i === 0 ? "advance" : "delivery") : "part") as StageKind,
        share: { type: "percent", bps } as Share,
      }));
      const notes =
        values.length === 2
          ? [`Read ${text} as ${values[0]! / 100}% in advance and ${values[1]! / 100}% on delivery.`]
          : [];
      return { ok: true, parts: titled(parts), notes };
    }
  }

  const raw: Omit<PlanPart, "title">[] = [];
  const notes: string[] = [];
  let lastFactor: number | null = null;
  for (const segment of segments(text)) {
    const stage = stageOf(segment);
    const isRest = REST.test(segment);
    const shareWords = stripStages(segment.replace(new RegExp(REST.source, "g"), " "));
    let reading = readShare(shareWords);
    if (!reading && isRest) reading = { share: { type: "rest" }, bareNumber: false };
    if (!reading) return { ok: false };
    if (reading.share.type === "amount") {
      const parsed = parseAmountText(shareWords);
      const factor = parsed.ok ? parsed.amount.biggest : null;
      if (reading.bareNumber && lastFactor !== null && reading.share.paise < lastFactor * 100) {
        const paise = reading.share.paise * lastFactor;
        notes.push(`Read "${shareWords}" as ${formatRupees(paise)}, in the same unit as the part before it.`);
        reading = { share: { type: "amount", paise }, bareNumber: false };
      } else if (factor !== null) {
        lastFactor = factor;
      }
    }
    raw.push({ stage: stage ?? "part", share: reading.share });
  }
  if (raw.length === 0 || raw.length > MAX_PARTS) return { ok: false };
  if (raw.filter((p) => p.share.type === "rest").length > 1) return { ok: false };
  return { ok: true, parts: titled(raw), notes };
}

export type Resolution = { ok: true; milestones: MilestoneDraft[] } | { ok: false; note: string };

function percentLabel(bps: number): string {
  return `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`;
}

/** Turns plan parts into milestones whose paise sum exactly to the total. Never fixes a mismatch quietly. */
export function resolvePlan(parts: PlanPart[], totalPaise: number): Resolution {
  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) return { ok: false, note: PLAN_NEEDS_TOTAL };
  const restIndex = parts.findIndex((p) => p.share.type === "rest");
  const amounts = parts.map((p) => {
    switch (p.share.type) {
      case "percent":
        return Math.floor((totalPaise * p.share.bps) / 10_000);
      case "equal":
        return Math.floor(totalPaise / p.share.count);
      case "amount":
        return p.share.paise;
      case "rest":
        return 0;
    }
  });

  const allPercent = parts.every((p) => p.share.type === "percent" || p.share.type === "equal");
  if (allPercent && parts.every((p) => p.share.type === "percent")) {
    const bpsTotal = parts.reduce((sum, p) => sum + (p.share.type === "percent" ? p.share.bps : 0), 0);
    if (bpsTotal !== 10_000) {
      const shown = parts.map((p) => (p.share.type === "percent" ? percentLabel(p.share.bps) : "")).join(" + ");
      return { ok: false, note: `${shown} = ${percentLabel(bpsTotal)}, not 100%. Make the parts add up.` };
    }
  }

  if (restIndex >= 0) {
    const others = amounts.reduce((sum, a, i) => (i === restIndex ? sum : sum + a), 0);
    if (others >= totalPaise) {
      const shown = amounts.filter((_, i) => i !== restIndex).map(formatRupees).join(" + ");
      return {
        ok: false,
        note: `${shown} already comes to ${formatRupees(others)}, which leaves nothing of the ${formatRupees(totalPaise)} total for the rest.`,
      };
    }
    amounts[restIndex] = totalPaise - others;
  } else if (allPercent) {
    const sum = amounts.reduce((a, b) => a + b, 0);
    amounts[amounts.length - 1]! += totalPaise - sum;
  } else {
    const sum = amounts.reduce((a, b) => a + b, 0);
    if (sum !== totalPaise) {
      const shown = amounts.map(formatRupees).join(" + ");
      return {
        ok: false,
        note: `${shown} = ${formatRupees(sum)}, but the total is ${formatRupees(totalPaise)}. Make the parts add up.`,
      };
    }
  }
  if (amounts.some((a) => a <= 0)) return { ok: false, note: "Every part has to be more than zero." };
  return { ok: true, milestones: parts.map((p, i) => ({ title: p.title, stage: p.stage, amountPaise: amounts[i]! })) };
}

export function plan(raw: string, ctx: { totalPaise: number | null }): Normalized<PlanValue> {
  const { text } = prepare(raw);
  if (!text) return failed(PLAN_UNREADABLE);
  const parsed = parseParts(text);
  if (!parsed.ok) return failed(PLAN_UNREADABLE);
  if (ctx.totalPaise === null) {
    const amountsOnly = parsed.parts.every((p) => p.share.type === "amount");
    if (amountsOnly) {
      const milestones = parsed.parts.map((p) => ({
        title: p.title,
        stage: p.stage,
        amountPaise: p.share.type === "amount" ? p.share.paise : 0,
      }));
      return inferred({ parts: parsed.parts, milestones }, PLAN_NEEDS_TOTAL);
    }
    return inferred({ parts: parsed.parts, milestones: null }, PLAN_NEEDS_TOTAL);
  }
  const resolution = resolvePlan(parsed.parts, ctx.totalPaise);
  if (!resolution.ok) return { value: { parts: parsed.parts, milestones: null }, confidence: "failed", note: resolution.note };
  const value = { parts: parsed.parts, milestones: resolution.milestones };
  return parsed.notes.length ? inferred(value, parsed.notes.join(" ")) : exact(value);
}
