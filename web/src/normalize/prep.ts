const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/**
 * Wispr Flow formats dictation as a sentence: a capital first letter and a closing full stop
 * ("Pachees hazaar."). Blanks hold fragments, not sentences, so that formatting is undone first.
 */
export function undoWisprFormatting(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim()
    .replace(/[.!?।…]+$/u, "")
    .trim();
}

export function devanagariDigitsToAscii(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** Lowercased, single-spaced text with Wispr's sentence formatting and pause dots removed. */
export function toParseable(raw: string): string {
  return devanagariDigitsToAscii(undoWisprFormatting(raw))
    .toLowerCase()
    .replace(/\.{2,}|…/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FILLER_WORDS = [
  "theek hai",
  "thik hai",
  "i think",
  "i guess",
  "itna hi",
  "basically",
  "matlab",
  "achha",
  "accha",
  "acha",
  "okay",
  "toh",
  "bas",
  "haan",
  "han",
  "haa",
  "umm",
  "uhh",
  "hmm",
  "um",
  "uh",
  "ok",
  "so",
  "like",
  "well",
  "yaar",
  "bhai",
  "ji",
  "na",
  "to",
];

const fillerAlternation = FILLER_WORDS.map((w) => w.replace(/ /g, "\\s+")).join("|");
const LEADING_FILLER = new RegExp(`^(?:(?:${fillerAlternation})(?=$|[\\s,;:])[\\s,;:]*)+`, "u");
const TRAILING_FILLER = new RegExp(`(?:[\\s,;:]+|^)(?:${fillerAlternation})$`, "u");

export function stripFiller(s: string): string {
  let out = s.trim().replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, "");
  for (;;) {
    const next = out
      .replace(LEADING_FILLER, "")
      .replace(TRAILING_FILLER, "")
      .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, "")
      .trim();
    if (next === out) return out;
    out = next;
  }
}

const CORRECTION_MARKER =
  /(?:^|[\s,;:—–-])(nahi nahi|nahin nahin|no no|nahi|nahin|nai|sorry|i mean|matlab|actually|wait|scratch that|make that|make it|or rather|rather|galti se|correction|no(?=\s*,))(?=$|[\s,;:—–-])/g;

export interface Resolved {
  text: string;
  corrected: boolean;
  previous?: string;
}

/**
 * People correct themselves mid-sentence ("teen... nahi, do", "25 hazaar, sorry, 22").
 * The last value said wins; the one before it is kept so a bare "22" can borrow "hazaar".
 * A marker with nothing after it is not a correction ("koi limit nahi").
 */
export function resolveCorrections(s: string): Resolved {
  const cleaned = stripFiller(s);
  const markers = [...cleaned.matchAll(CORRECTION_MARKER)];
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]!;
    const end = (m.index ?? 0) + m[0].length;
    const after = stripFiller(cleaned.slice(end));
    if (!after) continue;
    const prevMarker = markers[i - 1];
    const start = prevMarker ? (prevMarker.index ?? 0) + prevMarker[0].length : 0;
    const previous = stripFiller(cleaned.slice(start, m.index ?? 0));
    return previous ? { text: after, corrected: true, previous } : { text: after, corrected: true };
  }
  return { text: cleaned, corrected: false };
}

/** The common path for every structured blank: undo formatting, lowercase, resolve corrections. */
export function prepare(raw: string): Resolved {
  return resolveCorrections(toParseable(raw));
}

/**
 * A restart without a correction word ("ek lakh, ek lakh pachees hazaar"): when the whole
 * phrase won't parse, the clause after the last comma is the one the speaker finished.
 */
export function lastClause(text: string): string | undefined {
  const parts = text.split(/,\s+/);
  if (parts.length < 2) return undefined;
  return stripFiller(parts[parts.length - 1]!) || undefined;
}
