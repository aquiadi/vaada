import { describe, expect, it } from "vitest";
import { EMPTY_PAYOUT_FIELDS, type PayoutFields, payoutProblems, requirementProblems, requirementText, toPayload } from "./payoutForm";

const filled: PayoutFields = {
  ...EMPTY_PAYOUT_FIELDS,
  legal_name: "  Aditi   Rao ",
  pan: "abcde1234f",
  account_number: "5010 0123 4417",
  confirm_account_number: "501001234417",
  ifsc: "hdfc0001234",
  street1: "12 Saket Nagar",
  city: "Indore",
  state: "Madhya Pradesh",
  postal_code: "452018",
  phone: "+91 98260-12345",
};

describe("payout form", () => {
  it("accepts a complete form and tidies it for the API", () => {
    expect(payoutProblems(filled)).toEqual({});
    expect(toPayload(filled)).toMatchObject({
      legal_name: "Aditi Rao",
      business_type: "individual",
      pan: "ABCDE1234F",
      account_number: "501001234417",
      ifsc: "HDFC0001234",
      phone: "+919826012345",
    });
    expect(toPayload(filled)).not.toHaveProperty("confirm_account_number");
  });

  it("catches account numbers that don't match", () => {
    expect(Object.keys(payoutProblems({ ...filled, confirm_account_number: "501001234471" }))).toEqual(["confirm_account_number"]);
  });

  it("marks every malformed field, not just the first", () => {
    const problems = payoutProblems({ ...filled, pan: "ABCDE12345", ifsc: "HDFC1001234", postal_code: "45201", phone: "98260" });
    expect(Object.keys(problems).sort()).toEqual(["ifsc", "pan", "phone", "postal_code"]);
  });

  it("leaves the second address line optional", () => {
    expect(payoutProblems({ ...filled, street2: "" })).toEqual({});
  });

  it("maps Razorpay's field references onto the form", () => {
    const requirement = {
      field_reference: "settlements.account_number",
      reason_code: "penny_testing_failed",
      description: "The bank could not verify this account.",
    };
    expect(requirementProblems([requirement])).toEqual({ account_number: "The bank could not verify this account." });
    expect(requirementText({ reason_code: "penny_testing_failed" })).toBe("Penny testing failed.");
  });
});
