import { describe, expect, it } from "vitest";
import { formatDeedDate, formatInstantIst, formatIsoDate } from "./dates";

describe("dates", () => {
  it("writes a calendar date with its weekday", () => {
    expect(formatIsoDate("2026-10-17")).toBe("Sat 17 Oct 2026");
  });

  it("dates a deed the way a deed does", () => {
    expect(formatDeedDate("2026-10-01")).toBe("the 1st day of October, 2026");
    expect(formatDeedDate("2026-10-12")).toBe("the 12th day of October, 2026");
  });

  it("writes instants in IST with our month names", () => {
    expect(formatInstantIst("2026-09-28T08:33:00Z")).toBe("28 Sep 2026, 14:03 IST");
  });

  it("writes the minutes after midnight IST as 00, on the IST date", () => {
    expect(formatInstantIst("2026-09-28T18:35:00Z")).toBe("29 Sep 2026, 00:05 IST");
  });
});
