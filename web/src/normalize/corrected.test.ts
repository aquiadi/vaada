import { describe, expect, it } from "vitest";
import { amount } from "./amount";
import { CORRECTED_CASES } from "./cases/corrected";
import { count } from "./count";
import { date } from "./date";
import { personName } from "./text";

const ctx = { today: { y: 2026, m: 10, d: 9 }, maxDays: 120 };

function normalize(field: string, raw: string) {
  switch (field) {
    case "amount":
      return amount(raw).value;
    case "date":
      return date(raw, ctx).value;
    case "count":
      return count(raw).value;
    case "name":
      return personName(raw).value;
    default:
      throw new Error(`No normalizer for ${field}`);
  }
}

describe("corrected dictations stay fixed", () => {
  it.each(CORRECTED_CASES.map((c) => [...c]))("%s: %s", (field, raw, expected) => {
    expect(normalize(field, raw)).toEqual(expected);
  });
});
