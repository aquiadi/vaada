import { describe, expect, it } from "vitest";
import { count } from "./count";
import { percent, PERCENT_UNREADABLE } from "./percent";

describe("percent", () => {
  it.each<[string, number]>([
    ["25%", 25],
    ["Pachees percent.", 25],
    ["25 percent", 25],
    ["bees pratishat", 20],
    ["ek chauthai", 25],
    ["aadha", 50],
    ["100%", 100],
  ])("%s", (raw, value) => {
    expect(percent(raw)).toEqual({ value, confidence: "exact" });
  });

  it("a third is inferred", () => {
    expect(percent("a third")).toMatchObject({ value: 33, confidence: "inferred" });
  });

  it.each(["0%", "150 percent", "thoda sa"])("%s fails", (raw) => {
    expect(percent(raw)).toEqual({ value: null, confidence: "failed", note: PERCENT_UNREADABLE });
  });
});

describe("days for the late-fee clause read through count", () => {
  it.each<[string, number]>([
    ["Paanch din.", 5],
    ["5 days", 5],
    ["ek hafta", 7],
    ["teen din", 3],
  ])("%s", (raw, value) => {
    expect(count(raw, { unit: "days" }).value).toBe(value);
  });
});
