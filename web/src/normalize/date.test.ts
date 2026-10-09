import { describe, expect, it } from "vitest";
import { todayInKolkata } from "./calendar";
import { date, DATE_UNREADABLE, dateLimitNote } from "./date";

const ctx = { today: { y: 2026, m: 10, d: 9 }, maxDays: 120 };

describe("date: absolute dates", () => {
  it.each<[string, string]>([
    ["17 Oct", "2026-10-17"],
    ["17 October.", "2026-10-17"],
    ["October 17th", "2026-10-17"],
    ["17th Oct 2026", "2026-10-17"],
    ["Oct 20, 2026", "2026-10-20"],
    ["20th of October", "2026-10-20"],
    ["17/10", "2026-10-17"],
    ["17-10-2026", "2026-10-17"],
    ["17/10/26", "2026-10-17"],
    ["17.10", "2026-10-17"],
    ["17 tareekh", "2026-10-17"],
    ["17 tarikh tak", "2026-10-17"],
    ["17th", "2026-10-17"],
    ["by 20th", "2026-10-20"],
    ["5 tareekh", "2026-11-05"],
    ["satrah October", "2026-10-17"],
    ["3 Jan", "2027-01-03"],
    ["१७/१०", "2026-10-17"],
    ["2026-11-02", "2026-11-02"],
  ])("%s", (raw, iso) => {
    expect(date(raw, ctx)).toEqual({ value: iso, confidence: "exact" });
  });
});

describe("date: relative dates against today in Kolkata", () => {
  it.each<[string, string]>([
    ["aaj", "2026-10-09"],
    ["kal", "2026-10-10"],
    ["Kal tak.", "2026-10-10"],
    ["tomorrow", "2026-10-10"],
    ["parson", "2026-10-11"],
    ["Monday tak", "2026-10-12"],
    ["somvar ko", "2026-10-12"],
    ["mangalvar", "2026-10-13"],
    ["is Sunday", "2026-10-11"],
    ["do hafte mein", "2026-10-23"],
    ["10 din mein", "2026-10-19"],
    ["das din mein", "2026-10-19"],
    ["within 10 days", "2026-10-19"],
    ["in 2 weeks", "2026-10-23"],
    ["teen hafte", "2026-10-30"],
    ["ek mahine mein", "2026-11-09"],
    ["mahine ke end tak", "2026-10-31"],
    ["end of the month", "2026-10-31"],
    ["agle mahine ke end tak", "2026-11-30"],
    ["Friday, matlab Saturday", "2026-10-10"],
  ])("%s", (raw, iso) => {
    expect(date(raw, ctx)).toEqual({ value: iso, confidence: "exact" });
  });

  it.each<[string, string]>([
    ["Friday tak.", "2026-10-16"],
    ["shukravar tak", "2026-10-16"],
    ["next Friday", "2026-10-16"],
    ["agle Monday", "2026-10-12"],
    ["agle hafte", "2026-10-16"],
    ["next week", "2026-10-16"],
    ["Friday se pehle", "2026-10-15"],
    ["17 Oct, nahi 18", "2026-10-18"],
  ])("%s reads as inferred", (raw, iso) => {
    const result = date(raw, ctx);
    expect(result.value).toBe(iso);
    expect(result.confidence).toBe("inferred");
    expect(result.note).toBeTruthy();
  });
});

describe("date: festivals are always inferred", () => {
  it.each<[string, string]>([
    ["Diwali se pehle", "2026-11-07"],
    ["Diwali tak", "2026-11-08"],
    ["before Diwali", "2026-11-07"],
    ["Christmas tak", "2026-12-25"],
    ["Diwali ke baad", "2026-11-09"],
  ])("%s", (raw, iso) => {
    const result = date(raw, ctx);
    expect(result.value).toBe(iso);
    expect(result.confidence).toBe("inferred");
    expect(result.note).toContain("check it");
  });
});

describe("date: failures", () => {
  it.each<[string, string]>([
    ["kabhi bhi", DATE_UNREADABLE],
    ["", DATE_UNREADABLE],
    ["jaldi", DATE_UNREADABLE],
    ["Holi ke baad", dateLimitNote(120)],
    ["1 Oct", dateLimitNote(120)],
    ["5/10/2026", "That date has already passed. Pick today or a day after it."],
    ["31 Feb", "That isn't a real date. Check the day and the month."],
  ])("%s", (raw, note) => {
    expect(date(raw, ctx)).toEqual({ value: null, confidence: "failed", note });
  });

  it("explains the limit in one plain sentence", () => {
    expect(dateLimitNote(120).split(". ").length).toBe(1);
  });
});

describe("todayInKolkata", () => {
  it("rolls over at midnight IST, not UTC", () => {
    expect(todayInKolkata(new Date("2026-10-09T18:29:00Z"))).toEqual({ y: 2026, m: 10, d: 9 });
    expect(todayInKolkata(new Date("2026-10-09T18:31:00Z"))).toEqual({ y: 2026, m: 10, d: 10 });
  });
});
