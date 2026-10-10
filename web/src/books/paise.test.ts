import { describe, expect, it } from "vitest";
import { parseRupees } from "./paise";

function paise(text: string): number | string {
  const parsed = parseRupees(text);
  return parsed.ok ? parsed.paise : parsed.message;
}

describe("parseRupees", () => {
  it("reads whole rupees", () => {
    expect(paise("5000")).toBe(500000);
    expect(paise("1")).toBe(100);
  });

  it("reads Indian and western grouping alike", () => {
    expect(paise("1,25,000")).toBe(12500000);
    expect(paise("125,000")).toBe(12500000);
  });

  it("reads paise exactly, with no float rounding", () => {
    expect(paise("5,000.50")).toBe(500050);
    expect(paise("5000.5")).toBe(500050);
    expect(paise("0.10")).toBe(10);
    expect(paise("4999.99")).toBe(499999);
    expect(paise("12.")).toBe(1200);
  });

  it("ignores a rupee sign and spaces", () => {
    expect(paise("₹ 5,000")).toBe(500000);
    expect(paise("Rs. 750")).toBe(75000);
    expect(paise("  2500  ")).toBe(250000);
  });

  it("refuses what isn't a plain amount", () => {
    expect(paise("")).toMatch(/Write the amount/);
    expect(paise("five thousand")).toMatch(/Use only digits/);
    expect(paise("-500")).toMatch(/Use only digits/);
    expect(paise("5,000,")).toMatch(/Use only digits/);
    expect(paise("1.2.3")).toMatch(/Use only digits/);
    expect(paise("10.505")).toMatch(/two places/);
    expect(paise("9".repeat(20))).toMatch(/too large/);
  });
});
