import { describe, expect, it } from "vitest";
import { processingFeePaise } from "../format/money";
import { daysInWords, hoursInWords, percentFromBps } from "./policyNumbers";

describe("percentFromBps", () => {
  it.each([
    [242, "2.42%"],
    [250, "2.5%"],
    [200, "2%"],
    [5, "0.05%"],
    [0, "0%"],
  ])("writes %i basis points as %s", (bps, text) => {
    expect(percentFromBps(bps)).toBe(text);
  });
});

describe("processingFeePaise", () => {
  it("matches the worked example on the pricing page", () => {
    expect(processingFeePaise(25_000_00, 242)).toBe(605_00);
  });

  it("rounds a part of a paisa up", () => {
    expect(processingFeePaise(1_001, 242)).toBe(25);
  });

  it("charges nothing at zero basis points", () => {
    expect(processingFeePaise(25_000_00, 0)).toBe(0);
  });
});

describe("time in words", () => {
  it("writes small counts as words and large ones as figures", () => {
    expect(daysInWords(1)).toBe("one day");
    expect(daysInWords(5)).toBe("five days");
    expect(daysInWords(120)).toBe("120 days");
  });

  it("writes whole days of hours as days", () => {
    expect(hoursInWords(24)).toBe("one day");
    expect(hoursInWords(48)).toBe("two days");
    expect(hoursInWords(12)).toBe("twelve hours");
  });
});
