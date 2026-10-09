import { formatRupees } from "../format/money";
import { classifyNumberWord, evaluate, numberWords, type NumberToken, SCALE } from "./numbers";
import { lastClause, prepare } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

export const AMOUNT_UNREADABLE = "Couldn't read an amount here. Try 'pachees hazaar' or '25000'.";
export const AMOUNT_FOREIGN = "Vaada deals are in rupees only. Write the amount in ₹, like '25000' or 'pachees hazaar'.";
const AMOUNT_ZERO = "An amount has to be more than zero.";
const AMOUNT_SUB_PAISA = "That has a fraction of a paisa in it. Round it to the nearest paisa.";
const LARGE_AMOUNT_PAISE = 10_00_000_00;

const FOREIGN = /\$|€|£|¥|\b(usd|dollars?|bucks|euros?|eur|gbp|pounds?|aed|dirhams?|sgd|yen|cad|aud)\b/;
const APPROXIMATE_WORDS = "around|approx|approximately|about|roughly|lagbhag|karib|kareeb|takriban|almost";
const APPROXIMATE = new RegExp(`\\b(${APPROXIMATE_WORDS})\\b`);
const APPROXIMATE_ALL = new RegExp(`\\b(${APPROXIMATE_WORDS})\\b`, "g");
const RUPEE_WORDS =
  /₹|\/-|रुपये|रुपए|रुपया|\b(rs|inr|rupees?|rupaye|rupay|rupaiye|rupaiya|rupiya|rupiye|only|sirf|just|bas|matr|total|amount|kul|fees?|charges?|ka|ke|ki|budget)\b\.?/g;

interface ParsedAmount {
  paise: number;
  biggest: number | null;
  approximate: boolean;
  impliedOne: boolean;
}

type ParseOutcome = { ok: true; amount: ParsedAmount } | { ok: false; note: string };

export function parseAmountText(text: string): ParseOutcome {
  if (FOREIGN.test(text)) return { ok: false, note: AMOUNT_FOREIGN };
  const approximate = APPROXIMATE.test(text);
  const cleaned = text.replace(APPROXIMATE_ALL, " ").replace(RUPEE_WORDS, " ").replace(/\s+/g, " ").trim();
  const words = numberWords(cleaned);
  if (words.length === 0) return { ok: false, note: AMOUNT_UNREADABLE };
  const tokens: NumberToken[] = [];
  for (const word of words) {
    const token = classifyNumberWord(word);
    if (!token) return { ok: false, note: AMOUNT_UNREADABLE };
    tokens.push(token);
  }
  const result = evaluate(tokens);
  if (!result.ok) return { ok: false, note: AMOUNT_UNREADABLE };
  if (result.scaled % (SCALE / 100) !== 0) return { ok: false, note: AMOUNT_SUB_PAISA };
  return {
    ok: true,
    amount: {
      paise: result.scaled / (SCALE / 100),
      biggest: result.biggest,
      approximate,
      impliedOne: result.impliedOne,
    },
  };
}

/** Always returns paise. */
export function amount(raw: string): Normalized<number> {
  const { text, corrected, previous } = prepare(raw.replace(/\/-/g, " "));
  if (!text) return failed(AMOUNT_UNREADABLE);
  let parsed = parseAmountText(text);
  const notes: string[] = [];
  if (!parsed.ok) {
    const clause = lastClause(text);
    const retry = clause ? parseAmountText(clause) : undefined;
    if (!retry?.ok) return failed(parsed.note);
    parsed = retry;
    notes.push("Took the figure you finished saying.");
  }
  let { paise } = parsed.amount;

  if (corrected && previous && parsed.amount.biggest === null) {
    const before = parseAmountText(previous);
    const factor = before.ok ? before.amount.biggest : null;
    if (factor !== null && paise < factor * 100) {
      paise *= factor;
      notes.push(`Read the correction as ${formatRupees(paise)}, keeping the unit you said first.`);
    }
  }
  if (paise <= 0) return failed(AMOUNT_ZERO);
  if (parsed.amount.approximate) notes.push(`A deed needs an exact figure, so this reads as exactly ${formatRupees(paise)}.`);
  if (parsed.amount.impliedOne) notes.push(`Read this as ${formatRupees(paise)}.`);
  if (paise > LARGE_AMOUNT_PAISE) notes.push(`That's ${formatRupees(paise)}. Check the zeros.`);

  return notes.length > 0 ? inferred(paise, notes.join(" ")) : exact(paise);
}
