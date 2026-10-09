import { describe, expect, it } from "vitest";
import { plan, PLAN_NEEDS_TOTAL, PLAN_UNREADABLE, resolvePlan } from "./plan";

const R = (rupees: number) => rupees * 100;
const total = R(25000);

function split(raw: string, totalPaise: number | null = total) {
  const result = plan(raw, { totalPaise });
  return {
    confidence: result.confidence,
    note: result.note,
    rows: result.value?.milestones?.map((m) => [m.title, m.amountPaise] as const) ?? null,
  };
}

describe("plan: common ways to say it", () => {
  it.each<[string, Array<readonly [string, number]>]>([
    [
      "aadha advance aadha delivery pe",
      [
        ["Advance", R(12500)],
        ["On delivery", R(12500)],
      ],
    ],
    [
      "Aadha advance, aadha delivery pe.",
      [
        ["Advance", R(12500)],
        ["On delivery", R(12500)],
      ],
    ],
    [
      "half upfront half on delivery",
      [
        ["Advance", R(12500)],
        ["On delivery", R(12500)],
      ],
    ],
    [
      "aadha pehle aadha baad mein",
      [
        ["Advance", R(12500)],
        ["On delivery", R(12500)],
      ],
    ],
    [
      "30% advance baaki delivery pe",
      [
        ["Advance", R(7500)],
        ["On delivery", R(17500)],
      ],
    ],
    [
      "30 percent upfront, rest on delivery",
      [
        ["Advance", R(7500)],
        ["On delivery", R(17500)],
      ],
    ],
    [
      "advance 10k baaki delivery pe",
      [
        ["Advance", R(10000)],
        ["On delivery", R(15000)],
      ],
    ],
    [
      "40% advance, 30% on first draft, 30% on delivery",
      [
        ["Advance", R(10000)],
        ["On first draft", R(7500)],
        ["On delivery", R(7500)],
      ],
    ],
    ["poora delivery pe", [["On delivery", R(25000)]]],
    ["Full payment on delivery.", [["On delivery", R(25000)]]],
    ["sab kuch delivery pe", [["On delivery", R(25000)]]],
    ["poora advance", [["Advance", R(25000)]]],
  ])("%s", (raw, rows) => {
    const result = split(raw);
    expect(result.confidence).toBe("exact");
    expect(result.rows).toEqual(rows);
  });
});

describe("plan: equal instalments, remainder on the last", () => {
  it("teen barabar installments of 25,000 puts the extra paisa last", () => {
    expect(split("teen barabar installments").rows).toEqual([
      ["Instalment I", 833333],
      ["Instalment II", 833333],
      ["Instalment III", 833334],
    ]);
  });

  it.each(["3 equal parts", "teen kishton mein", "in three payments", "teen barabar hisson mein"])("%s", (raw) => {
    const rows = split(raw).rows!;
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, [, paise]) => sum + paise, 0)).toBe(total);
  });

  it("do kishton mein", () => {
    expect(split("do kishton mein").rows).toEqual([
      ["Instalment I", R(12500)],
      ["Instalment II", R(12500)],
    ]);
  });
});

describe("plan: amounts must add up, never fixed quietly", () => {
  it("10 hazaar advance, baaki 15 delivery pe carries the unit across", () => {
    const result = split("10 hazaar advance, baaki 15 delivery pe");
    expect(result.rows).toEqual([
      ["Advance", R(10000)],
      ["On delivery", R(15000)],
    ]);
    expect(result.confidence).toBe("inferred");
  });

  it("shows the arithmetic when parts don't match the total", () => {
    const result = split("10 hazaar advance, 12 hazaar delivery pe");
    expect(result.confidence).toBe("failed");
    expect(result.note).toBe("₹10,000 + ₹12,000 = ₹22,000, but the total is ₹25,000. Make the parts add up.");
  });

  it("shows the arithmetic when percentages don't reach 100", () => {
    const result = split("40% advance, 30% on first draft, 20% on delivery");
    expect(result.confidence).toBe("failed");
    expect(result.note).toBe("40% + 30% + 20% = 90%, not 100%. Make the parts add up.");
  });

  it("refuses a rest that is nothing", () => {
    const result = split("30 hazaar advance, baaki delivery pe");
    expect(result.confidence).toBe("failed");
    expect(result.note).toContain("leaves nothing");
  });

  it("50-50 reads as advance and delivery", () => {
    const result = split("50-50");
    expect(result.rows).toEqual([
      ["Advance", R(12500)],
      ["On delivery", R(12500)],
    ]);
    expect(result.confidence).toBe("inferred");
  });

  it("40-30-30 splits into three parts", () => {
    expect(split("40-30-30").rows).toEqual([
      ["Part I", R(10000)],
      ["Part II", R(7500)],
      ["Part III", R(7500)],
    ]);
  });

  it("a correction replaces the whole plan", () => {
    expect(split("aadha advance aadha delivery pe, nahi nahi, 30% advance baaki delivery pe").rows).toEqual([
      ["Advance", R(7500)],
      ["On delivery", R(17500)],
    ]);
  });
});

describe("plan: without a total yet", () => {
  it("keeps the shape and waits", () => {
    const result = plan("aadha advance aadha delivery pe", { totalPaise: null });
    expect(result.confidence).toBe("inferred");
    expect(result.note).toBe(PLAN_NEEDS_TOTAL);
    expect(result.value?.parts.map((p) => p.title)).toEqual(["Advance", "On delivery"]);
    expect(result.value?.milestones).toBeNull();
  });
});

describe("plan: unreadable plans fall into the manual editor", () => {
  it.each(["jaise theek lage", "baad mein dekhenge", ""])("%j", (raw) => {
    expect(plan(raw, { totalPaise: total })).toEqual({ value: null, confidence: "failed", note: PLAN_UNREADABLE });
  });
});

describe("resolvePlan", () => {
  it("sums exactly to the paisa for awkward totals", () => {
    for (const totalPaise of [1, 7, 99, 100001, 2500001, 333333333]) {
      const result = resolvePlan(
        [
          { title: "A", stage: "instalment", share: { type: "equal", count: 3 } },
          { title: "B", stage: "instalment", share: { type: "equal", count: 3 } },
          { title: "C", stage: "instalment", share: { type: "equal", count: 3 } },
        ],
        totalPaise,
      );
      if (totalPaise < 3) {
        expect(result.ok).toBe(false);
        continue;
      }
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.milestones.reduce((s, m) => s + m.amountPaise, 0)).toBe(totalPaise);
    }
  });
});
