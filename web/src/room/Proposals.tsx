import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, Notice } from "../components/ui";
import { numberWord } from "../deed/blanks";
import { formatInstantIst } from "../format/dates";
import { toRoman } from "../format/roman";
import { api } from "../lib/api";
import { explain } from "../lib/errors";
import type { Room } from "../lib/types";
import { dayOf, firstName, otherParty, partyName, sentenceCase } from "./words";

type Refresh = () => Promise<unknown>;

/** A request that moves no money, so it needs no dialog: decline, or take back your own proposal. */
function PlainRequest({ label, send, refresh }: { label: string; send: () => Promise<unknown>; refresh: Refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await send();
      await refresh();
    } catch (caught) {
      setError(explain(caught, "We couldn’t confirm that went through. Reload the page to see where it stands before you try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <Button tone="plain" busy={busy} onClick={run}>
        {label}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </span>
  );
}

function Cancellation({ room, proposal, refresh, onMessages }: {
  room: Room;
  proposal: Room["cancellations"][number];
  refresh: Refresh;
  onMessages: (messages: string[]) => void;
}) {
  const who = partyName(room, proposal.proposed_role);
  const effect = proposal.effect ? sentenceCase(proposal.effect) : null;
  return (
    <li className="border-b hairline py-4 last:border-b-0">
      <p className="m-0 text-body text-ink">
        {sentenceCase(who)} proposed cancelling the rest of this deed, {formatInstantIst(proposal.created_at)}.
      </p>
      <blockquote className="m-0 mt-1 italic text-ink-soft">“{proposal.reason}”</blockquote>
      {effect ? (
        <p className="m-0 mt-2 text-note text-ink">
          <span className="label mr-2">If it’s confirmed</span>
          {effect}
        </p>
      ) : null}
      {proposal.can_respond ? (
        <div className="no-print mt-3 flex flex-wrap items-start gap-3">
          <ConfirmDialog
            trigger={<Button tone="danger">Confirm cancelling</Button>}
            title="Cancel the rest of this deed"
            effect={effect ?? "The rest of this deed is cancelled."}
            confirmLabel="Confirm cancelling"
            tone="danger"
            onConfirm={async () => {
              const outcome = await api.post<{ messages: string[] }>(`/cancellations/${proposal.id}/respond`, { confirm: true });
              onMessages(outcome.messages);
              await refresh();
            }}
          />
          <PlainRequest
            label="Decline"
            refresh={refresh}
            send={async () => {
              const outcome = await api.post<{ messages: string[] }>(`/cancellations/${proposal.id}/respond`, { confirm: false });
              onMessages(outcome.messages);
            }}
          />
        </div>
      ) : null}
      {proposal.can_withdraw ? (
        <div className="no-print mt-3 flex flex-wrap items-center gap-3">
          <p className="m-0 text-note italic text-ink-soft">Waiting for {firstName(otherParty(room))} to answer.</p>
          <PlainRequest label="Withdraw your proposal" refresh={refresh} send={() => api.post(`/cancellations/${proposal.id}/withdraw`)} />
        </div>
      ) : null}
    </li>
  );
}

function DateChange({ room, change, refresh }: { room: Room; change: Room["date_changes"][number]; refresh: Refresh }) {
  const who = partyName(room, change.proposed_role);
  const milestone = room.milestones.find((m) => m.idx === change.milestone_idx);
  const numeral = toRoman(change.milestone_idx);
  const graceDays = room.agreement?.policy.grace_days;
  const refundRule =
    graceDays !== undefined
      ? ` ${room.role === "client" ? "You" : firstName(room.client.name)} could ask for that part back only if it isn’t delivered within ${numberWord(graceDays)} days of the new date.`
      : "";
  return (
    <li className="border-b hairline py-4 last:border-b-0">
      <p className="m-0 text-body text-ink">
        {sentenceCase(who)} asked to move milestone {numeral}
        {milestone ? ` (${milestone.title})` : ""} from {dayOf(change.old_due_at)} to {dayOf(change.new_due_at)}.
      </p>
      {change.reason ? <blockquote className="m-0 mt-1 italic text-ink-soft">“{change.reason}”</blockquote> : null}
      {change.can_respond ? (
        <div className="no-print mt-3 flex flex-wrap items-start gap-3">
          <ConfirmDialog
            trigger={<Button>Agree to the new date</Button>}
            title="Agree to the new date"
            effect={`Milestone ${numeral} becomes due on ${dayOf(change.new_due_at)} instead of ${dayOf(change.old_due_at)}.${refundRule}`}
            confirmLabel="Agree"
            onConfirm={async () => {
              await api.post(`/date-changes/${change.id}/respond`, { confirm: true });
              await refresh();
            }}
          />
          <PlainRequest label="Decline" refresh={refresh} send={() => api.post(`/date-changes/${change.id}/respond`, { confirm: false })} />
        </div>
      ) : (
        <p className="m-0 mt-2 text-note italic text-ink-soft">Waiting for {firstName(otherParty(room))} to answer.</p>
      )}
    </li>
  );
}

/** Proposals still waiting for an answer. Settled ones live in the register. */
export function Proposals({ room, refresh }: { room: Room; refresh: Refresh }) {
  const [messages, setMessages] = useState<string[]>([]);
  const cancellations = room.cancellations.filter((c) => c.status === "proposed");
  const dateChanges = room.date_changes.filter((d) => d.status === "proposed");
  if (!cancellations.length && !dateChanges.length && !messages.length) return null;

  return (
    <section aria-labelledby="proposals-heading" className="mt-8 border-y-[3px] border-double border-gold py-4">
      <h2 id="proposals-heading" className="label m-0">
        Open proposals
      </h2>
      {messages.length ? (
        <Notice tone="ok" className="mt-3">
          {messages.map((m) => (
            <p key={m} className="m-0">
              {m}
            </p>
          ))}
        </Notice>
      ) : null}
      {cancellations.length || dateChanges.length ? (
        <ul className="m-0 list-none p-0">
          {cancellations.map((c) => (
            <Cancellation key={c.id} room={room} proposal={c} refresh={refresh} onMessages={setMessages} />
          ))}
          {dateChanges.map((d) => (
            <DateChange key={d.id} room={room} change={d} refresh={refresh} />
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-2 text-note italic text-ink-soft">Nothing is waiting for an answer.</p>
      )}
    </section>
  );
}
