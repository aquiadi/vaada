import { describe, expect, it } from "vitest";
import { amount, AMOUNT_FOREIGN, AMOUNT_UNREADABLE } from "./amount";

const R = (rupees: number) => rupees * 100;

describe("amount: digits, the path Wispr usually takes", () => {
  it.each<[string, number]>([
    ["25000", R(25000)],
    ["25,000", R(25000)],
    ["1,25,000", R(125000)],
    ["125,000", R(125000)],
    ["25,000/-", R(25000)],
    ["Rs. 25,000/-", R(25000)],
    ["₹25,000", R(25000)],
    ["₹ 25000", R(25000)],
    ["INR 25000", R(25000)],
    ["25000 rupees", R(25000)],
    ["Rupees 25,000 only.", R(25000)],
    ["25k", R(25000)],
    ["₹25K", R(25000)],
    ["25 K.", R(25000)],
    ["1.5 lakh", R(150000)],
    ["2.5L", R(250000)],
    ["1.5 lac", R(150000)],
    ["2 lacs", R(200000)],
    ["10 lakhs", R(1000000)],
    ["1.25 lakh", R(125000)],
    ["25000.50", 2500050],
    ["₹1,25,000.75", 12500075],
    ["25 thousand", R(25000)],
    ["25 hazaar", R(25000)],
    ["25 hazar rupaye", R(25000)],
    ["1 lakh 25 hazaar", R(125000)],
    ["25 hazaar 500", R(25500)],
    ["25000.", R(25000)],
    ["२५०००", R(25000)],
    ["₹२५,०००", R(25000)],
  ])("%s", (raw, paise) => {
    expect(amount(raw)).toEqual({ value: paise, confidence: "exact" });
  });
});

describe("amount: Hindi number words", () => {
  it.each<[string, number]>([
    ["Pachees hazaar.", R(25000)],
    ["pachchis hazaar", R(25000)],
    ["pachis hajar", R(25000)],
    ["chaalis hazaar", R(40000)],
    ["chalis hazar", R(40000)],
    ["pachaas hazaar", R(50000)],
    ["pachas hazaar", R(50000)],
    ["ek lakh pachees hazaar", R(125000)],
    ["do lakh pachaas hazaar", R(250000)],
    ["dhai hazaar", R(2500)],
    ["sava lakh", R(125000)],
    ["saadhe teen hazaar", R(3500)],
    ["dedh lakh", R(150000)],
    ["paune do lakh", R(175000)],
    ["sava do lakh", R(225000)],
    ["pandrah sau", R(1500)],
    ["ek hazaar paanch sau", R(1500)],
    ["ek sau pachees", R(125)],
    ["Barah hazaar paanch sau.", R(12500)],
    ["satrah hazaar", R(17000)],
    ["unnis hazaar", R(19000)],
    ["ikyavan hazaar", R(51000)],
    ["nabbe hazaar", R(90000)],
    ["ninyanave hazaar", R(99000)],
    ["tees hazaar rupaye", R(30000)],
    ["teen lakh", R(300000)],
    ["ek crore", R(10000000)],
    ["पच्चीस हज़ार", R(25000)],
    ["सवा लाख", R(125000)],
    ["ढाई हजार", R(2500)],
    ["एक लाख पच्चीस हज़ार", R(125000)],
  ])("%s", (raw, paise) => {
    const result = amount(raw);
    expect(result.value).toBe(paise);
    expect(result.confidence).not.toBe("failed");
  });
});

describe("amount: English number words", () => {
  it.each<[string, number]>([
    ["twenty five thousand", R(25000)],
    ["Twenty-five thousand.", R(25000)],
    ["one lakh twenty five thousand", R(125000)],
    ["two and a half lakh", R(250000)],
    ["one and a half lakh", R(150000)],
    ["a lakh", R(100000)],
    ["half a lakh", R(50000)],
    ["fifteen hundred", R(1500)],
    ["twenty five hundred", R(2500)],
    ["one hundred and twenty five thousand", R(125000)],
    ["rupees twenty five thousand only", R(25000)],
    ["fifty thousand", R(50000)],
  ])("%s", (raw, paise) => {
    expect(amount(raw).value).toBe(paise);
  });
});

describe("amount: false starts, filler and corrections", () => {
  it.each<[string, number, "exact" | "inferred"]>([
    ["Bas pachees hazaar.", R(25000), "exact"],
    ["matlab 25 hazaar", R(25000), "exact"],
    ["Basically 25k, itna hi.", R(25000), "exact"],
    ["haan toh pachees hazaar", R(25000), "exact"],
    ["25 hazaar, sorry, 22", R(22000), "inferred"],
    ["25 hazaar sorry 22 hazaar", R(22000), "exact"],
    ["teen... nahi, do lakh", R(200000), "exact"],
    ["tees hazaar nahi nahi pachees hazaar", R(25000), "exact"],
    ["30k, actually 28", R(28000), "inferred"],
    ["Umm, 25,000.", R(25000), "exact"],
    ["around 25 hazaar", R(25000), "inferred"],
    ["lagbhag pachees hazaar", R(25000), "inferred"],
  ])("%s", (raw, paise, confidence) => {
    const result = amount(raw);
    expect(result.value).toBe(paise);
    expect(result.confidence).toBe(confidence);
  });
});

describe("amount: failures say what to do", () => {
  it.each<[string, string]>([
    ["", AMOUNT_UNREADABLE],
    ["kuch pata nahi", AMOUNT_UNREADABLE],
    ["jitna theek lage", AMOUNT_UNREADABLE],
    ["$500", AMOUNT_FOREIGN],
    ["500 dollars", AMOUNT_FOREIGN],
    ["300 euros", AMOUNT_FOREIGN],
    ["25 30", AMOUNT_UNREADABLE],
    ["hazaar lakh", AMOUNT_UNREADABLE],
  ])("%s", (raw, note) => {
    expect(amount(raw)).toEqual({ value: null, confidence: "failed", note });
  });

  it("rejects zero", () => {
    expect(amount("0").confidence).toBe("failed");
  });

  it("flags a large figure for a second look", () => {
    const result = amount("12,50,000");
    expect(result.value).toBe(R(1250000));
    expect(result.confidence).toBe("inferred");
    expect(result.note).toContain("Check the zeros");
  });
});
