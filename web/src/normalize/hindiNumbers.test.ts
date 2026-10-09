import { describe, expect, it } from "vitest";
import { DEVANAGARI_SPELLINGS, hindiNumber, ROMAN_SPELLINGS } from "./hindiNumbers";

describe("Hindi number tables", () => {
  it("cover every number from 1 to 99 in both scripts", () => {
    const roman = new Set(ROMAN_SPELLINGS.map(([n]) => n));
    const devanagari = new Set(DEVANAGARI_SPELLINGS.map(([n]) => n));
    for (let n = 1; n <= 99; n++) {
      expect(roman.has(n), `roman ${n}`).toBe(true);
      expect(devanagari.has(n), `devanagari ${n}`).toBe(true);
    }
  });

  it("read back every spelling they list", () => {
    for (const [n, spellings] of [...ROMAN_SPELLINGS, ...DEVANAGARI_SPELLINGS]) {
      for (const spelling of spellings) expect(hindiNumber(spelling), spelling).toBe(n);
    }
  });

  it.each<[string, number]>([
    ["PACHEES", 25],
    ["Pachchees", 25],
    ["chaaliss", 40],
    ["chhattees", 36],
    ["ninyaanve", 99],
    ["atthaais", 28],
    ["पाँच", 5],
    ["पांच", 5],
    ["अड़तीस", 38],
    ["अडतीस", 38],
  ])("folds the variant %s", (word, n) => {
    expect(hindiNumber(word)).toBe(n);
  });
});
