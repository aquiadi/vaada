import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, ButtonLink, Field } from "../components/ui";
import { istDateOf } from "../format/dates";
import { formatRupees } from "../format/money";
import { toRoman } from "../format/roman";
import { api } from "../lib/api";
import { useConfig } from "../lib/config";
import type { Action, Room, RoomMilestone } from "../lib/types";
import { email as normalizeEmail } from "../normalize";
import { addDays, fromIsoDate, toIsoDate } from "../normalize/calendar";
import { NoteField } from "./NoteField";
import { firstName, otherParty } from "./words";

const HANDLED = new Set(["deliver", "approve", "refund", "dispute", "propose_date", "propose_cancellation", "withdraw", "resend", "reissue", "pay"]);
const DANGER = new Set(["dispute", "refund", "withdraw", "propose_cancellation"]);
const PRIMARY = new Set(["deliver", "approve"]);

interface Props {
  action: Action;
  room: Room;
  milestone?: RoomMilestone;
  /** Called after the API has accepted the action, with anything it said worth showing. */
  onDone: (message: string | null) => Promise<unknown>;
}

/** One action the API offered, behind a dialog that states its exact effect before anything happens. */
export function RoomAction({ action, room, milestone, onDone }: Props) {
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const [text, setText] = useState("");
  const [newDue, setNewDue] = useState("");
  const [addressLeft, setAddressLeft] = useState(false);

  if (!HANDLED.has(action.action)) return null;

  if (action.action === "pay") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-body text-ink">{action.effect}</p>
        <ButtonLink to={`/a/${room.slug}`}>{action.label}</ButtonLink>
      </div>
    );
  }

  const base = milestone ? `/milestones/${milestone.id}` : `/deals/${room.id}`;
  const other = firstName(otherParty(room));
  // Read the way the deed's Send reads it, so a mistyped address is caught here and not by the API's pattern.
  const resendTo = action.action === "resend" ? normalizeEmail(text) : null;
  const resendAddress = resendTo && resendTo.confidence !== "failed" ? resendTo.value : null;

  async function send(): Promise<string | null> {
    switch (action.action) {
      case "deliver":
        await api.post(`${base}/deliver`, { note: text.trim() || null });
        return null;
      case "approve":
        await api.post(`${base}/approve`);
        return null;
      case "refund":
        return (await api.post<{ completed: boolean; message: string }>(`${base}/refund`)).message;
      case "dispute":
        await api.post(`${base}/dispute`, { reason: text.trim() });
        return null;
      case "propose_date":
        await api.post(`${base}/date-changes`, { new_due: newDue, reason: text.trim() });
        return null;
      case "propose_cancellation":
        await api.post(`${base}/cancellations`, { reason: text.trim() });
        return null;
      case "withdraw":
        await api.post(`${base}/withdraw`);
        return null;
      case "resend":
        await api.post(`${base}/resend`, { client_email: resendAddress });
        return `Sent again to ${resendAddress}.`;
    }
    return null;
  }

  async function confirm() {
    if (action.action === "reissue") {
      const fresh = await api.post<{ id: string }>(`${base}/reissue`);
      navigate(`/new/${fresh.id}`);
      return;
    }
    const message = await send();
    setText("");
    setNewDue("");
    setAddressLeft(false);
    await onDone(message);
  }

  let fields: ReactNode = null;
  let ready = true;
  switch (action.action) {
    case "deliver":
      fields = (
        <NoteField
          label={`A note for ${other} (optional)`}
          hint="Where the files are, or what to look at first. It goes with the delivery."
          value={text}
          onChange={setText}
        />
      );
      break;
    case "dispute":
      fields = <NoteField label="What's wrong" hint={`${other} and Vaada will both read this.`} value={text} onChange={setText} required />;
      ready = text.trim().length > 0;
      break;
    case "propose_cancellation":
      fields = <NoteField label="Why" hint={`${other} sees this with your proposal.`} value={text} onChange={setText} required />;
      ready = text.trim().length > 0;
      break;
    case "propose_date": {
      const latest = room.published_at && config ? toIsoDate(addDays(fromIsoDate(istDateOf(room.published_at)), config.limits.max_deal_days)) : undefined;
      fields = (
        <div className="flex flex-col gap-4">
          <Field
            type="date"
            label="The new date"
            value={newDue}
            onChange={(event) => setNewDue(event.target.value)}
            min={config?.today}
            max={latest}
            required
          />
          <NoteField label="Why (optional)" hint={`${other} sees this with your request.`} value={text} onChange={setText} maxLength={500} />
        </div>
      );
      ready = newDue.length > 0;
      break;
    }
    case "resend":
      fields = (
        <Field
          type="email"
          label="Send it to"
          hint={
            resendAddress && resendTo?.note
              ? resendTo.note
              : room.client.email_masked
                ? `It last went to ${room.client.email_masked}.`
                : undefined
          }
          error={!resendAddress && addressLeft && text.trim() ? resendTo?.note : null}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => setAddressLeft(true)}
          autoComplete="email"
          required
        />
      );
      ready = resendAddress !== null;
      break;
  }

  const danger = DANGER.has(action.action);
  return (
    <ConfirmDialog
      trigger={<Button tone={danger ? "danger" : PRIMARY.has(action.action) ? "primary" : "plain"}>{action.label}</Button>}
      title={action.label}
      effect={
        <>
          {milestone ? (
            <p className="label m-0 mb-2">
              Milestone {toRoman(milestone.idx)} · {milestone.title} · {formatRupees(milestone.amount_paise)}
            </p>
          ) : null}
          <p className="m-0">{action.effect}</p>
        </>
      }
      confirmLabel={action.label}
      tone={danger ? "danger" : "primary"}
      confirmDisabled={!ready}
      onConfirm={confirm}
    >
      {fields}
    </ConfirmDialog>
  );
}
