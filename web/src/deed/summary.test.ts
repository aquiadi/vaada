import { describe, expect, it } from "vitest";
import { clauseOf, hoursInWords } from "./blanks";
import { agreementSummary, summaryText } from "./summary";
import { SAMPLE_AGREEMENT } from "./sample";

describe("summaryText", () => {
  it("releases a part after the review window and the hold buffer, as section 4 says", () => {
    expect(agreementSummary(SAMPLE_AGREEMENT)).toBe(
      "Aditi Rao will deliver a logo, a colour palette and a one-page set of brand guidelines to Rahul Mehta of Kiln Labs, " +
        "in two parts, by Fri 30 Oct 2026, for ₹25,000. Rahul pays it all at the start; Razorpay holds it, and each part goes " +
        "to Aditi when Rahul approves it, or one day after its five-day review ends if Rahul says nothing.",
    );
  });

  it("names the parties by role while their blanks are empty", () => {
    const text = summaryText({
      maker: null,
      client: null,
      organisation: null,
      work: null,
      totalPaise: null,
      parts: 0,
      lastDue: null,
      reviewDays: 7,
      bufferHours: 36,
    });
    expect(text).toBe(
      "The Maker will deliver the work to the Client, in parts still to be set. The Client pays it all at the start; Razorpay " +
        "holds it, and each part goes to the Maker when the Client approves it, or 36 hours after its seven-day review ends if " +
        "the Client says nothing.",
    );
  });
});

describe("hoursInWords", () => {
  it.each([
    [24, "one day"],
    [48, "two days"],
    [36, "36 hours"],
    [1, "one hour"],
  ])("%i hours reads as %s", (hours, words) => {
    expect(hoursInWords(hours)).toBe(words);
  });
});

describe("clauseOf", () => {
  it.each([
    ["client_organisation", "client_organisation"],
    ["late_fee.days", "late_fee"],
    ["kill_fee.percent", "kill_fee"],
    ["ip_transfer.exclusions", "ip_transfer"],
    ["client_name", null],
    ["milestones.1.amount", null],
    ["late_feeling", null],
  ])("%s belongs to %s", (key, clause) => {
    expect(clauseOf(key)).toBe(clause);
  });
});
