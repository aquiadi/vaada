const NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 4000) throw new RangeError(`No roman numeral for ${n}`);
  let rest = n;
  let out = "";
  for (const [value, numeral] of NUMERALS) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

export function fromRoman(s: string): number | undefined {
  const upper = s.toUpperCase();
  if (!/^[MDCLXVI]+$/.test(upper)) return undefined;
  let total = 0;
  let i = 0;
  for (const [value, numeral] of NUMERALS) {
    while (upper.startsWith(numeral, i)) {
      total += value;
      i += numeral.length;
    }
  }
  return i === upper.length && toRoman(total) === upper ? total : undefined;
}
