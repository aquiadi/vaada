import { type ChangeEvent, type FormEvent, type InputHTMLAttributes, useState } from "react";
import { Button, Field, Notice, SectionMark } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { Payout } from "../lib/types";
import {
  type BusinessType,
  EMPTY_PAYOUT_FIELDS,
  FIELD_PROBLEM,
  type FieldName,
  isFieldName,
  type PayoutFields,
  payoutProblems,
  requirementProblems,
  toPayload,
} from "./payoutForm";

const FIELD_ORDER = Object.keys(EMPTY_PAYOUT_FIELDS) as FieldName[];
const LINING = { fontVariantNumeric: "lining-nums tabular-nums" } as const;

const fieldId = (name: FieldName) => `payout-${name}`;

/** What was sent earlier in this visit comes back whole; after a reload only what Vaada keeps on file can. */
function startingFields(previous: Payout | null, lastSent: PayoutFields | null): PayoutFields {
  if (lastSent) return lastSent;
  const businessType: BusinessType = previous?.business_type === "proprietorship" ? "proprietorship" : "individual";
  return { ...EMPTY_PAYOUT_FIELDS, legal_name: previous?.legal_name ?? "", business_type: businessType, ifsc: previous?.ifsc ?? "" };
}

function BusinessTypeField({ value, error, onChange }: { value: BusinessType; error?: string; onChange: (value: BusinessType) => void }) {
  const id = fieldId("business_type");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label">
        Business type
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value === "proprietorship" ? "proprietorship" : "individual")}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-${error ? "error" : "hint"}`}
          className={`w-full cursor-pointer appearance-none rounded-none border-0 border-b bg-transparent py-1.5 pr-6 pl-0 font-serif text-body text-ink outline-none transition-colors duration-150 focus:border-bahi focus-visible:outline-none ${error ? "border-bahi" : "border-[color-mix(in_srgb,var(--ink)_35%,transparent)]"}`}
        >
          <option value="individual">Individual</option>
          <option value="proprietorship">Sole proprietorship</option>
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-note text-ink-soft">
          ▾
        </span>
      </div>
      {error ? (
        <p id={`${id}-error`} className="m-0 text-note text-bahi">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="m-0 text-note text-ink-soft">
          Most freelancers are individuals. Choose proprietorship only if you have registered one.
        </p>
      )}
    </div>
  );
}

interface Props {
  previous: Payout | null;
  lastSent: PayoutFields | null;
  onSaved: (payout: Payout, sent: PayoutFields) => void;
}

/** The bank form. Every value is checked here first, then sent once to the API, which passes it straight to Razorpay. */
export function PayoutFormSheet({ previous, lastSent, onSaved }: Props) {
  const [fields, setFields] = useState<PayoutFields>(() => startingFields(previous, lastSent));
  const [problems, setProblems] = useState<Partial<Record<FieldName, string>>>(() =>
    previous?.status === "needs_clarification" ? requirementProblems(previous.requirements) : {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function focusFirst(found: Partial<Record<FieldName, string>>) {
    const first = FIELD_ORDER.find((name) => found[name]);
    if (first) document.getElementById(fieldId(first))?.focus();
  }

  function update(name: FieldName, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
    setProblems((current) => {
      if (!current[name]) return current;
      const rest = { ...current };
      delete rest[name];
      return rest;
    });
  }

  function field(
    name: Exclude<FieldName, "business_type">,
    label: string,
    extra: InputHTMLAttributes<HTMLInputElement> & { hint?: string } = {},
  ) {
    return (
      <Field
        id={fieldId(name)}
        label={label}
        value={fields[name]}
        onChange={(e: ChangeEvent<HTMLInputElement>) => update(name, e.target.value)}
        error={problems[name] ?? null}
        {...extra}
      />
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = payoutProblems(fields);
    setProblems(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFormError("Some details need another look. Each one is marked below.");
      focusFirst(found);
      return;
    }
    setBusy(true);
    try {
      const { payout } = await api.post<{ payout: Payout }>("/payouts", toPayload(fields));
      onSaved(payout, fields);
    } catch (caught) {
      if (caught instanceof ApiError && isFieldName(caught.field)) {
        const marked = { [caught.field]: caught.code === "invalid" ? FIELD_PROBLEM[caught.field] : caught.message };
        setProblems(marked);
        focusFirst(marked);
      } else if (caught instanceof ApiError) {
        setFormError(caught.message);
      } else {
        console.error("payout setup failed", caught);
        setFormError("Your details didn’t reach Razorpay, and nothing was saved. Try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Payout details" className="sheet grain rounded-sm px-5 py-8 sm:px-10 sm:py-10">
      <section aria-labelledby="payout-who">
        <SectionMark id="payout-who" n={1} title="Who you are" />
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {field("legal_name", "Legal name (as on PAN)", {
            autoComplete: "name",
            maxLength: 120,
            className: "sm:col-span-2",
            hint: "Exactly as printed on your PAN card. Razorpay matches the two.",
          })}
          <BusinessTypeField
            value={fields.business_type}
            error={problems.business_type}
            onChange={(value) => setFields((current) => ({ ...current, business_type: value }))}
          />
          {field("pan", "PAN", {
            autoComplete: "off",
            autoCapitalize: "characters",
            spellCheck: false,
            maxLength: 10,
            style: { ...LINING, textTransform: "uppercase", letterSpacing: "0.08em" },
            hint: "Ten characters, like ABCDE1234F.",
          })}
        </div>
      </section>

      <section aria-labelledby="payout-bank" className="mt-10">
        <SectionMark id="payout-bank" n={2} title="Your bank" />
        <p className="measure m-0 mb-6 border-l-2 border-gold pl-3 text-note text-ink">
          Your PAN and full account number go straight to Razorpay. Vaada keeps only the last four digits of the account and the IFSC.
        </p>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {field("account_number", "Bank account number", {
            inputMode: "numeric",
            autoComplete: "off",
            spellCheck: false,
            maxLength: 24,
            style: LINING,
            hint: "Digits only, as printed in your passbook.",
          })}
          {field("confirm_account_number", "Confirm account number", {
            inputMode: "numeric",
            autoComplete: "off",
            spellCheck: false,
            maxLength: 24,
            style: LINING,
            hint: "Once more, so a slip of the finger can’t send your money elsewhere.",
          })}
          {field("ifsc", "IFSC", {
            autoComplete: "off",
            autoCapitalize: "characters",
            spellCheck: false,
            maxLength: 11,
            style: { ...LINING, textTransform: "uppercase", letterSpacing: "0.08em" },
            hint: "On your cheque book or passbook, like HDFC0001234.",
          })}
        </div>
      </section>

      <section aria-labelledby="payout-where" className="mt-10">
        <SectionMark id="payout-where" n={3} title="Where to find you" />
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {field("street1", "Address", { autoComplete: "address-line1", maxLength: 100, className: "sm:col-span-2" })}
          {field("street2", "Address, second line", {
            autoComplete: "address-line2",
            maxLength: 100,
            className: "sm:col-span-2",
            hint: "Optional.",
          })}
          {field("city", "City", { autoComplete: "address-level2", maxLength: 60 })}
          {field("state", "State", { autoComplete: "address-level1", maxLength: 60 })}
          {field("postal_code", "PIN code", { inputMode: "numeric", autoComplete: "postal-code", maxLength: 6, style: LINING })}
          {field("phone", "Phone", { type: "tel", autoComplete: "tel", maxLength: 16, style: LINING })}
        </div>
      </section>

      <hr className="rule-double mt-10 mb-6" />
      {formError ? (
        <Notice tone="error" className="mb-5">
          {formError}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="submit" busy={busy}>
          Send to Razorpay
        </Button>
        <p className="m-0 text-note text-ink-soft">Razorpay checks the account before anything is paid into it.</p>
      </div>
    </form>
  );
}
