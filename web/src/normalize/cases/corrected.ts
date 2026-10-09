/**
 * Real dictations a person had to correct, kept as regression cases. One line per case:
 * the field, what Wispr wrote, and the value the person settled on. The admin page exports
 * corrected `dictations` rows in exactly this shape, so adding one is a paste.
 *
 * Amounts are paise, dates are ISO calendar dates read against Fri 9 Oct 2026, counts are numbers.
 */
export type CorrectedCase =
  | readonly ["amount", string, number]
  | readonly ["date", string, string]
  | readonly ["count", string, number | "unlimited"]
  | readonly ["name", string, string];

export const CORRECTED_CASES: readonly CorrectedCase[] = [
  ["amount", "Pachees hazaar sirf.", 2500000],
  ["amount", "Bees hazaar, nahi, pachees.", 2500000],
  ["amount", "Ek lakh, ek lakh pachees hazaar.", 12500000],
  ["date", "Agle Friday tak.", "2026-10-16"],
  ["date", "Diwali se pehle.", "2026-11-07"],
  ["count", "Teen, bas teen revisions.", 3],
  ["name", "Rahul Mehta ji.", "Rahul Mehta"],
];
