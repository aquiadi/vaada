import { describe, expect, it } from "vitest";
import { count, COUNT_UNREADABLE, UNLIMITED_NOTE } from "./count";

describe("count: revisions", () => {
  it.each<[string, number]>([
    ["teen", 3],
    ["Teen.", 3],
    ["3", 3],
    ["do revisions", 2],
    ["Two rounds of changes.", 2],
    ["teen revision tak", 3],
    ["max 4 revisions", 4],
    ["bas do", 2],
    ["paanch baar", 5],
    ["zero", 0],
    ["no revisions", 0],
    ["koi nahi", 0],
    ["teen... nahi, do", 2],
    ["३", 3],
  ])("%s", (raw, n) => {
    expect(count(raw)).toEqual({ value: n, confidence: "exact" });
  });

  it.each(["unlimited", "Unlimited revisions.", "jitne chahiye", "koi limit nahi", "as many as needed"])(
    "%s is allowed with a warning",
    (raw) => {
      expect(count(raw)).toEqual({ value: "unlimited", confidence: "inferred", note: UNLIMITED_NOTE });
    },
  );

  it("a range reads as the higher number", () => {
    expect(count("2-3 revisions")).toMatchObject({ value: 3, confidence: "inferred" });
    expect(count("do ya teen")).toMatchObject({ value: 3, confidence: "inferred" });
  });

  it.each(["kuch", "dekhte hain", ""])("%j fails", (raw) => {
    expect(count(raw)).toEqual({ value: null, confidence: "failed", note: COUNT_UNREADABLE });
  });
});
