import { devanagariKey, hindiNumber } from "./hindiNumbers";

/** Values are carried as integers scaled by 10^4 so "1.2575 lakh" and "sava" stay exact. */
export const SCALE = 10_000;

export type NumberToken =
  | { kind: "number"; scaled: number }
  | { kind: "hundred" }
  | { kind: "big"; factor: number; word: string }
  | { kind: "adjust"; scaled: number }
  | { kind: "half" }
  | { kind: "a" }
  | { kind: "and" };

const ENGLISH: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const BIG: Record<string, number> = {
  thousand: 1e3,
  thousands: 1e3,
  hazaar: 1e3,
  hazar: 1e3,
  hazzar: 1e3,
  hajar: 1e3,
  hajaar: 1e3,
  hazaaron: 1e3,
  k: 1e3,
  "हजार": 1e3,
  lakh: 1e5,
  lakhs: 1e5,
  laakh: 1e5,
  lac: 1e5,
  lacs: 1e5,
  lacks: 1e5,
  l: 1e5,
  "लाख": 1e5,
  million: 1e6,
  crore: 1e7,
  crores: 1e7,
  cr: 1e7,
  karod: 1e7,
  karor: 1e7,
  "करोड": 1e7,
};

const HUNDRED = new Set(["hundred", "hundreds", "sau", "सौ"]);

const FRACTION_NUMBERS: Record<string, number> = {
  dedh: 1.5,
  derh: 1.5,
  dhedh: 1.5,
  dedd: 1.5,
  dhai: 2.5,
  dhaai: 2.5,
  adhai: 2.5,
  arhai: 2.5,
  dhaee: 2.5,
  "डेढ": 1.5,
  "ढाई": 2.5,
  "अढाई": 2.5,
};

/** sava, saadhe and paune shift the number that follows them: saadhe teen is 3.5. */
const ADJUSTERS: Record<string, number> = {
  sava: 0.25,
  savaa: 0.25,
  sawa: 0.25,
  sawaa: 0.25,
  "सवा": 0.25,
  saadhe: 0.5,
  sadhe: 0.5,
  saade: 0.5,
  sade: 0.5,
  saarhe: 0.5,
  sarhe: 0.5,
  "साढे": 0.5,
  paune: -0.25,
  pone: -0.25,
  paunay: -0.25,
  "पौने": -0.25,
};

const HALF = new Set(["half", "aadha", "adha", "aadhaa", "aadhe", "adhe", "आधा", "आधे"]);

export function parseDecimal(s: string): number | undefined {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return undefined;
  const whole = Number(m[1]);
  const frac = m[2] ?? "";
  if (frac.length > 4 && /[1-9]/.test(frac.slice(4))) return undefined;
  const scaled = whole * SCALE + Number((frac + "0000").slice(0, 4));
  return Number.isSafeInteger(scaled) ? scaled : undefined;
}

export function classifyNumberWord(word: string): NumberToken | undefined {
  const w = /\p{Script=Devanagari}/u.test(word) ? devanagariKey(word) : word;
  const decimal = parseDecimal(w);
  if (decimal !== undefined) return { kind: "number", scaled: decimal };
  if (w === "and" || w === "aur" || w === "&") return { kind: "and" };
  if (w === "a" || w === "an") return { kind: "a" };
  if (HUNDRED.has(w)) return { kind: "hundred" };
  const big = BIG[w];
  if (big !== undefined) return { kind: "big", factor: big, word: w };
  const fraction = FRACTION_NUMBERS[w];
  if (fraction !== undefined) return { kind: "number", scaled: fraction * SCALE };
  const adjust = ADJUSTERS[w];
  if (adjust !== undefined) return { kind: "adjust", scaled: adjust * SCALE };
  if (HALF.has(w)) return { kind: "half" };
  const english = ENGLISH[w];
  if (english !== undefined) return { kind: "number", scaled: english * SCALE };
  const hindi = hindiNumber(w);
  if (hindi !== undefined) return { kind: "number", scaled: hindi * SCALE };
  return undefined;
}

/** Breaks "₹25K", "2.5L", "1,25,000" and "twenty-five" into words the evaluator understands. */
export function numberWords(text: string): string[] {
  return text
    .replace(/(\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?=\D|$)/g, (m) => m.replace(/,/g, ""))
    .replace(/(\d)([a-z]|\p{Script=Devanagari})/gu, "$1 $2")
    .replace(/([a-z]|\p{Script=Devanagari})(\d)/gu, "$1 $2")
    .split(/[\s,\-–]+/)
    .filter(Boolean);
}

export type EvalResult =
  | { ok: true; scaled: number; biggest: number | null; impliedOne: boolean }
  | { ok: false; reason: "two-numbers" | "order" | "dangling" | "empty" };

function isWholeTens(scaled: number): boolean {
  return scaled % (10 * SCALE) === 0 && scaled >= 20 * SCALE && scaled <= 90 * SCALE;
}

/** Indian place values: crore > lakh > thousand > hundred, read left to right. */
export function evaluate(tokens: NumberToken[]): EvalResult {
  let total = 0;
  let current = 0;
  let lastBig = Number.POSITIVE_INFINITY;
  let biggest: number | null = null;
  let pendingAdjust: number | null = null;
  let previous: NumberToken | null = null;
  let sawValue = false;
  let impliedOne = false;
  let articleSeen = false;

  for (const token of tokens) {
    switch (token.kind) {
      case "and":
        continue;
      case "a":
        articleSeen = true;
        continue;
      case "adjust":
        if (pendingAdjust !== null) return { ok: false, reason: "dangling" };
        pendingAdjust = token.scaled;
        continue;
      case "number": {
        const n = token.scaled + (pendingAdjust ?? 0);
        pendingAdjust = null;
        if (current > 0 && previous?.kind === "number") {
          const composite = isWholeTens(previous.scaled) && token.scaled < 10 * SCALE && token.scaled % SCALE === 0;
          if (!composite) return { ok: false, reason: "two-numbers" };
        }
        if (current > 0 && previous?.kind === "hundred" && n >= 100 * SCALE) {
          return { ok: false, reason: "two-numbers" };
        }
        current += n;
        sawValue = true;
        break;
      }
      case "half":
        current += SCALE / 2;
        sawValue = true;
        break;
      case "hundred": {
        let base = current;
        if (base === 0) {
          base = SCALE + (pendingAdjust ?? 0);
          if (pendingAdjust === null && !articleSeen) impliedOne = true;
        }
        pendingAdjust = null;
        current = base * 100;
        sawValue = true;
        break;
      }
      case "big": {
        if (token.factor >= lastBig) return { ok: false, reason: "order" };
        let base = current;
        if (base === 0) {
          base = SCALE + (pendingAdjust ?? 0);
          if (pendingAdjust === null && !articleSeen) impliedOne = true;
        }
        pendingAdjust = null;
        total += base * token.factor;
        current = 0;
        lastBig = token.factor;
        biggest = biggest ?? token.factor;
        sawValue = true;
        break;
      }
    }
    articleSeen = false;
    previous = token;
  }
  if (pendingAdjust !== null) return { ok: false, reason: "dangling" };
  if (!sawValue) return { ok: false, reason: "empty" };
  total += current;
  if (!Number.isSafeInteger(total)) return { ok: false, reason: "order" };
  return { ok: true, scaled: total, biggest, impliedOne };
}

/** A small whole number said on its own: "3", "teen", "three", "तीन". */
export function smallNumber(word: string): number | undefined {
  const token = classifyNumberWord(word);
  if (token?.kind !== "number" || token.scaled % SCALE !== 0) return undefined;
  return token.scaled / SCALE;
}

/** A whole number written as one or more words: "pachees", "twenty five", "1,25,000". */
export function wholeNumber(text: string): number | undefined {
  const tokens: NumberToken[] = [];
  for (const word of numberWords(text)) {
    const token = classifyNumberWord(word);
    if (!token) return undefined;
    tokens.push(token);
  }
  const result = evaluate(tokens);
  if (!result.ok || result.scaled % SCALE !== 0) return undefined;
  return result.scaled / SCALE;
}
