const indianGrouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0, useGrouping: true });

function assertPaise(paise: number): void {
  if (!Number.isSafeInteger(paise)) throw new RangeError(`Not an integer paise amount: ${paise}`);
}

/** ₹1,25,000 or ₹1,25,000.50. Integer arithmetic only. */
export function formatRupees(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(paise);
  const rem = abs % 100;
  const rupees = (abs - rem) / 100;
  const fraction = rem === 0 ? "" : `.${String(rem).padStart(2, "0")}`;
  return `${sign}₹${indianGrouping.format(rupees)}${fraction}`;
}

/** The processing fee on a deal total, rounded up to the paisa, exactly as the API charges it. */
export function processingFeePaise(totalPaise: number, bps: number): number {
  assertPaise(totalPaise);
  return Math.floor((totalPaise * bps + 9_999) / 10_000);
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  const ones = ONES[n % 10]!;
  return ones ? `${tens}-${ones}` : tens;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** The way a deed writes a sum out: "Rupees Twenty-Five Thousand only". */
export function rupeesInWords(paise: number): string {
  assertPaise(paise);
  if (paise < 0) throw new RangeError("Negative amounts are not written in words.");
  const rem = paise % 100;
  let rupees = (paise - rem) / 100;
  if (rupees === 0 && rem === 0) return "Rupees Zero only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5);
  rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3);
  rupees %= 1e3;
  if (crore) parts.push(`${crore >= 1000 ? String(crore) : belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rupees) parts.push(belowThousand(rupees));
  const rupeePart = parts.length ? `Rupees ${parts.join(" ")}` : "";
  const paisePart = rem ? `${belowHundred(rem)} Paise` : "";
  return `${[rupeePart, paisePart].filter(Boolean).join(" and ")} only`;
}
