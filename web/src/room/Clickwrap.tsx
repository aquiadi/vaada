import * as Checkbox from "@radix-ui/react-checkbox";
import { useId, useState, type FormEvent } from "react";
import { Button, Field, Notice } from "../components/ui";
import { api } from "../lib/api";
import { explain } from "../lib/errors";
import type { PublicDeed } from "../lib/types";

interface Props {
  slug: string;
  email: string | null;
  onAccepted: (deed: PublicDeed) => void;
}

/** Accepting is signing: the client types their name and ticks one box with a real label. */
export function Clickwrap({ slug, email, onAccepted }: Props) {
  const agreeId = useId();
  const [fullName, setFullName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [agreeError, setAgreeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = fullName.trim().replace(/\s+/g, " ");
    const missingName = name.length < 2 ? "Type your full name, the way you’d sign it." : null;
    const missingAgreement = agreed ? null : "Tick the box to say you’ve read the deed and agree to it.";
    setNameError(missingName);
    setAgreeError(missingAgreement);
    setError(null);
    if (missingName || missingAgreement) return;
    setBusy(true);
    try {
      onAccepted(await api.post<PublicDeed>(`/public/deeds/${slug}/accept`, { full_name: name, agree: true }));
    } catch (caught) {
      setError(explain(caught, "We couldn’t confirm your acceptance. Reload the page to see whether it was recorded before you try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="accept-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="accept-heading" className="font-display text-h3 text-ink">
          Accept the deed
        </h2>
        <p className="m-0 mt-2 text-note text-ink-soft">
          Accepting is your signature. Vaada records the name you type, {email ? `your email (${email})` : "your email"} and the time,
          against this deed’s hash.
        </p>
      </div>
      <Field
        label="Your full name"
        hint="As you’d sign it."
        autoComplete="name"
        value={fullName}
        onChange={(e) => {
          setFullName(e.target.value);
          setNameError(null);
        }}
        error={nameError}
        maxLength={120}
      />
      <div>
        <div className="flex items-start gap-3">
          <Checkbox.Root
            id={agreeId}
            checked={agreed}
            onCheckedChange={(state) => {
              setAgreed(state === true);
              setAgreeError(null);
            }}
            aria-invalid={agreeError ? true : undefined}
            aria-describedby={agreeError ? `${agreeId}-error` : undefined}
            className={`mt-[0.2rem] inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-xs border bg-paper text-ink ${
              agreeError ? "border-bahi" : "border-ink"
            }`}
          >
            <Checkbox.Indicator>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              </svg>
            </Checkbox.Indicator>
          </Checkbox.Root>
          <label htmlFor={agreeId} className="cursor-pointer text-body text-ink">
            I have read this deed and agree to it.
          </label>
        </div>
        {agreeError ? (
          <p id={`${agreeId}-error`} role="alert" className="m-0 ml-8 mt-1 border-l-2 border-bahi pl-2 text-note text-ink">
            {agreeError}
          </p>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div>
        <Button type="submit" busy={busy}>
          Accept the deed
        </Button>
      </div>
    </form>
  );
}
