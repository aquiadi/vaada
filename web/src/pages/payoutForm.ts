export type BusinessType = "individual" | "proprietorship";

export interface PayoutFields {
  legal_name: string;
  business_type: BusinessType;
  pan: string;
  account_number: string;
  confirm_account_number: string;
  ifsc: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
}

export type FieldName = keyof PayoutFields;

export type PayoutPayload = Omit<PayoutFields, "confirm_account_number">;

export const EMPTY_PAYOUT_FIELDS: PayoutFields = {
  legal_name: "",
  business_type: "individual",
  pan: "",
  account_number: "",
  confirm_account_number: "",
  ifsc: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  postal_code: "",
  phone: "",
};

/** What each field should look like, in words. Also used when the API turns a field down for its shape. */
export const FIELD_PROBLEM: Record<FieldName, string> = {
  legal_name: "Write your name exactly as it appears on your PAN card.",
  business_type: "Choose whether you work as an individual or as a sole proprietorship.",
  pan: "A PAN is ten characters, like ABCDE1234F.",
  account_number: "A bank account number is 9 to 18 digits.",
  confirm_account_number: "The two account numbers don’t match. Check both against your passbook or cheque book.",
  ifsc: "An IFSC is eleven characters, like HDFC0001234. It’s printed on your cheque book.",
  street1: "Write the first line of your address.",
  street2: "Keep the second line under 100 characters.",
  city: "Write your city or town.",
  state: "Write your state.",
  postal_code: "A PIN code is six digits.",
  phone: "A phone number is ten digits; you may add +91 in front.",
};

const digitsOnly = (text: string) => text.replace(/[\s-]/g, "");
const collapse = (text: string) => text.trim().replace(/\s+/g, " ");

export function toPayload(fields: PayoutFields): PayoutPayload {
  return {
    legal_name: collapse(fields.legal_name),
    business_type: fields.business_type,
    pan: fields.pan.trim().toUpperCase(),
    account_number: digitsOnly(fields.account_number),
    ifsc: fields.ifsc.trim().toUpperCase(),
    street1: collapse(fields.street1),
    street2: collapse(fields.street2),
    city: collapse(fields.city),
    state: collapse(fields.state),
    postal_code: fields.postal_code.trim(),
    phone: digitsOnly(fields.phone),
  };
}

/** The same rules the API applies, checked first so a mistake is caught beside the field it belongs to. */
export function payoutProblems(fields: PayoutFields): Partial<Record<FieldName, string>> {
  const p = toPayload(fields);
  const problems: Partial<Record<FieldName, string>> = {};
  const lengthOk = (text: string, min: number, max: number) => text.length >= min && text.length <= max;
  if (!lengthOk(p.legal_name, 2, 120)) problems.legal_name = FIELD_PROBLEM.legal_name;
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan)) problems.pan = FIELD_PROBLEM.pan;
  if (!/^\d{9,18}$/.test(p.account_number)) problems.account_number = FIELD_PROBLEM.account_number;
  else if (digitsOnly(fields.confirm_account_number) !== p.account_number)
    problems.confirm_account_number = FIELD_PROBLEM.confirm_account_number;
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.ifsc)) problems.ifsc = FIELD_PROBLEM.ifsc;
  if (!lengthOk(p.street1, 3, 100)) problems.street1 = FIELD_PROBLEM.street1;
  if (p.street2.length > 100) problems.street2 = FIELD_PROBLEM.street2;
  if (!lengthOk(p.city, 2, 60)) problems.city = FIELD_PROBLEM.city;
  if (!lengthOk(p.state, 2, 60)) problems.state = FIELD_PROBLEM.state;
  if (!/^\d{6}$/.test(p.postal_code)) problems.postal_code = FIELD_PROBLEM.postal_code;
  if (!/^\+?\d{10,13}$/.test(p.phone)) problems.phone = FIELD_PROBLEM.phone;
  return problems;
}

export function isFieldName(name: string | null): name is FieldName {
  return name !== null && name in EMPTY_PAYOUT_FIELDS;
}

const REQUIREMENT_FIELD: Record<string, FieldName> = {
  account_number: "account_number",
  ifsc: "ifsc",
  ifsc_code: "ifsc",
  pan: "pan",
  legal_business_name: "legal_name",
  beneficiary_name: "legal_name",
  phone: "phone",
};

export interface Requirement {
  field_reference?: string;
  reason_code?: string;
  description?: string;
}

/** Razorpay names fields its own way ("settlements.account_number"); this marks the matching blank on our form. */
export function requirementProblems(requirements: Requirement[]): Partial<Record<FieldName, string>> {
  const problems: Partial<Record<FieldName, string>> = {};
  for (const requirement of requirements) {
    const field = REQUIREMENT_FIELD[requirement.field_reference?.split(".").pop() ?? ""];
    if (field) problems[field] = requirementText(requirement);
  }
  return problems;
}

export function requirementText(requirement: Requirement): string {
  if (requirement.description) return requirement.description;
  const code = (requirement.reason_code ?? "").replace(/_/g, " ").trim();
  return code ? `${code.charAt(0).toUpperCase()}${code.slice(1)}.` : "Razorpay asked for a detail to be checked.";
}
