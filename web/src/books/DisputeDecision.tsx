import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, Field, Notice, Rupees } from "../components/ui";
import { formatInstantIst } from "../format/dates";
import { formatRupees } from "../format/money";
import { toRoman } from "../format/roman";
import { ApiError, api } from "../lib/api";
import { NoteField } from "../room/NoteField";
import type { OpenDispute, Resolution, ResolutionPreview } from "./desk";
import { parseRupees } from "./paise";

const CHOICES: ReadonlyArray<{ value: Resolution; label: string }> = [
  { value: "release", label: "Release it to the Maker" },
  { value: "refund", label: "Refund the Client in full" },
  { value: "split", label: "Split: refund part to the Client" },
];

function splitRefund(text: string, amountPaise: number): { paise: number | null; error: string | null } {
  if (!text.trim()) return { paise: null, error: null };
  const parsed = parseRupees(text);
  if (!parsed.ok) return { paise: null, error: parsed.message };
  if (parsed.paise <= 0 || parsed.paise >= amountPaise) {
    return {
      paise: null,
      error: `A split refunds more than ₹0 and less than ${formatRupees(amountPaise)}. For all of it, choose a full refund.`,
    };
  }
  return { paise: parsed.paise, error: null };
}

interface Props {
  dispute: OpenDispute;
  onDecided: (said: string) => Promise<unknown>;
  onClose: () => void;
}

/** The desk's decision on one dispute. Both sides of the outcome come from the API before anything can be confirmed. */
export function DisputeDecision({ dispute, onDecided, onClose }: Props) {
  const headingId = useId();
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [refundText, setRefundText] = useState("");
  const [note, setNote] = useState("");
  const split = resolution === "split" ? splitRefund(refundText, dispute.amount_paise) : null;
  const refundPaise = split?.paise ?? null;
  const ready = resolution !== null && (resolution !== "split" || refundPaise !== null);

  const preview = useQuery({
    queryKey: ["dispute-preview", dispute.id, resolution, refundPaise],
    queryFn: () => api.post<ResolutionPreview>(`/admin/disputes/${dispute.id}/preview`, { resolution, refund_paise: refundPaise }),
    enabled: ready,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const outcome = ready && !preview.isPlaceholderData ? preview.data : undefined;
  const canDecide = outcome !== undefined && note.trim().length > 0;
  const milestone = `Deed No. ${dispute.deed_no}, Milestone ${toRoman(dispute.milestone_idx)}`;

  async function decide() {
    const done = await api.post<ResolutionPreview>(`/admin/disputes/${dispute.id}/resolve`, {
      resolution,
      refund_paise: refundPaise,
      note: note.trim(),
    });
    await onDecided(`${milestone} is decided. ${done.client_sentence} ${done.maker_sentence}`);
  }

  return (
    <section aria-labelledby={headingId} className="sheet mt-4 rounded-sm p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={headingId} className="m-0 font-serif text-body font-semibold text-ink">
          Deciding {milestone}
        </h3>
        <Button tone="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="m-0 mt-1 text-note text-ink-soft">
        Raised by the {dispute.opened_role === "client" ? "Client" : "Maker"} on {formatInstantIst(dispute.opened_at)}. The milestone is{" "}
        <Rupees paise={dispute.amount_paise} />, of which the Maker’s share is <Rupees paise={dispute.transfer_paise} />.
      </p>
      <blockquote className="measure m-0 mt-3 border-l-2 border-gold pl-3 font-serif italic text-ink">“{dispute.reason}”</blockquote>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          <fieldset className="m-0 border-0 p-0">
            <legend className="label mb-2">The decision</legend>
            <div className="flex flex-col gap-2">
              {CHOICES.map((choice) => (
                <label key={choice.value} className="flex cursor-pointer items-baseline gap-2 text-body text-ink">
                  <input
                    type="radio"
                    name={`resolution-${dispute.id}`}
                    value={choice.value}
                    checked={resolution === choice.value}
                    onChange={() => setResolution(choice.value)}
                    className="accent-[var(--ink)]"
                  />
                  {choice.label}
                </label>
              ))}
            </div>
          </fieldset>
          {resolution === "split" ? (
            <Field
              label="Refund to the Client, in rupees"
              inputMode="decimal"
              autoComplete="off"
              value={refundText}
              onChange={(event) => setRefundText(event.target.value)}
              hint={`More than ₹0 and less than ${formatRupees(dispute.amount_paise)}, like 4,500 or 4,500.50.`}
              error={split?.error}
            />
          ) : null}
          <NoteField
            label="Note to both parties"
            hint="Both of them read this beside the decision. Say what you decided and why."
            value={note}
            onChange={setNote}
            required
            maxLength={2000}
          />
        </div>

        <div className="flex flex-col items-start gap-4">
          <div aria-live="polite" className="w-full">
            <p className="label m-0 mb-2">Both sides of it</p>
            {resolution === null ? (
              <p className="m-0 text-note italic text-ink-soft">Choose a decision to see what each side gets.</p>
            ) : !ready ? (
              <p className="m-0 text-note italic text-ink-soft">Write the refund amount to see what each side gets.</p>
            ) : preview.isError ? (
              <Notice tone="error">
                {preview.error instanceof ApiError ? preview.error.message : "We couldn’t work out this decision. Try again."}
              </Notice>
            ) : outcome ? (
              <dl className="figures m-0 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-y border-gold py-3 text-body">
                <dt className="label pt-1">Client</dt>
                <dd className="m-0 text-ink">{outcome.client_sentence}</dd>
                <dt className="label pt-1">Maker</dt>
                <dd className="m-0 text-ink">{outcome.maker_sentence}</dd>
              </dl>
            ) : (
              <p className="m-0 text-note italic text-ink-soft">Working out both sides.</p>
            )}
          </div>
          {outcome && !note.trim() ? <p className="m-0 text-note text-ink-soft">Write the note to both parties before deciding.</p> : null}
          <ConfirmDialog
            trigger={<Button disabled={!canDecide}>Decide</Button>}
            title={`Decide ${milestone}`}
            effect={
              outcome ? (
                <div className="figures space-y-2">
                  <p className="m-0">{outcome.client_sentence}</p>
                  <p className="m-0">{outcome.maker_sentence}</p>
                  <p className="m-0 text-note text-ink-soft">Both of them get your note with the decision. A decision can’t be taken back.</p>
                </div>
              ) : null
            }
            confirmLabel="Decide and move the money"
            onConfirm={decide}
          />
        </div>
      </div>
    </section>
  );
}
