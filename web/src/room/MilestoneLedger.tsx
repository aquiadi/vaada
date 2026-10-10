import { useState, type ReactNode } from "react";
import { Notice, Rupees } from "../components/ui";
import { RegistryLink } from "../deed/PublishedDeed";
import { formatInstantIst } from "../format/dates";
import { formatRupees } from "../format/money";
import { toRoman } from "../format/roman";
import type { RegistryEntry, Room, RoomMilestone } from "../lib/types";
import { RoomAction } from "./RoomAction";
import { dayOf, milestoneStanding, partyName, sentenceCase } from "./words";

type Dispute = Room["disputes"][number];

/** On a phone the chain record drops under the line it belongs to; on wider screens it sits beside it. */
function RecordBeside({ entry }: { entry: RegistryEntry | undefined }) {
  if (!entry) return null;
  return (
    <span className="block sm:ml-2 sm:inline">
      <RegistryLink entry={entry} />
    </span>
  );
}

function Line({ term, record, after, children }: { term: string; record?: RegistryEntry; after?: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="label pt-[0.2rem]">{term}</dt>
      <dd className="m-0 min-w-0 text-ink">
        {children}
        <RecordBeside entry={record} />
        {after}
      </dd>
    </>
  );
}

function decision(room: Room, d: Dispute): string {
  const maker = partyName(room, "maker");
  const client = partyName(room, "client");
  const released = d.release_paise ? `${formatRupees(d.release_paise)} released to ${maker} for the next settlement` : null;
  const refunded = d.refund_paise ? `${formatRupees(d.refund_paise)} refunded to ${client}` : null;
  if (d.resolution === "split" && released && refunded) return `${sentenceCase(released)}, and ${refunded}.`;
  if (d.resolution === "refund" && refunded) return `${sentenceCase(refunded)}.`;
  if (released) return `${sentenceCase(released)}.`;
  return "Vaada has decided.";
}

function DisputeNote({ room, dispute, records }: { room: Room; dispute: Dispute; records: RegistryEntry[] }) {
  return (
    <div className="mt-4 border-l-2 border-gold pl-3 text-note">
      <p className="m-0 text-ink">
        <span className="label mr-2">Problem raised</span>
        by {partyName(room, dispute.opened_role)}, {formatInstantIst(dispute.created_at)}
        <RecordBeside entry={records.find((r) => r.kind === "Disputed")} />
      </p>
      <blockquote className="m-0 mt-1 font-serif italic text-ink">“{dispute.reason}”</blockquote>
      {dispute.status === "open" ? (
        <p className="m-0 mt-2 text-ink-soft">
          The money for this milestone stays held until Vaada decides.
          {dispute.hold_confirmed ? null : " Razorpay is confirming the hold."}
        </p>
      ) : (
        <>
          <p className="m-0 mt-2 text-ink">
            <span className="label mr-2">Decided</span>
            {dispute.resolved_at ? `${formatInstantIst(dispute.resolved_at)}. ` : null}
            {decision(room, dispute)}
            <RecordBeside entry={records.find((r) => r.kind === "Resolved")} />
          </p>
          {dispute.notes ? <p className="m-0 mt-1 text-ink">Vaada’s note: “{dispute.notes}”</p> : null}
        </>
      )}
    </div>
  );
}

function MilestoneEntry({ room, milestone: m, onChanged }: { room: Room; milestone: RoomMilestone; onChanged: () => Promise<unknown> }) {
  const [message, setMessage] = useState<string | null>(null);
  const record = (kind: string) => m.registry.find((r) => r.kind === kind);
  const capturedAt = room.payment?.status === "captured" ? room.payment.captured_at : null;
  const headingId = `milestone-${m.idx}`;
  const disputes = room.disputes.filter((d) => d.milestone_idx === m.idx);
  const cancelled = record("Cancelled");

  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b hairline sm:grid-cols-[3.5rem_minmax(0,1fr)]">
      <p aria-hidden="true" className="m-0 pr-3 pt-4 text-right font-display text-h3 leading-none text-ink-soft">
        {toRoman(m.idx)}
      </p>
      <article aria-labelledby={headingId} className="min-w-0 border-l-[3px] border-double border-bahi py-4 pl-4">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id={headingId} className="m-0 font-serif text-body font-semibold text-ink">
            <span className="sr-only">Milestone {toRoman(m.idx)}: </span>
            {m.title}
          </h3>
          <Rupees paise={m.amount_paise} className="text-body text-ink" />
        </header>
        <p className="m-0 mt-1 text-note text-ink-soft">{m.deliverables}</p>
        <p aria-live="polite" className={`m-0 mt-3 text-body italic ${m.status === "released" ? "text-stamp" : "text-ink"}`}>
          {milestoneStanding(m)}
        </p>
        <dl className="m-0 mt-2 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[5.75rem_minmax(0,1fr)] gap-y-1.5 text-note">
          <Line term="Due">{dayOf(m.due_at)}</Line>
          {capturedAt ? (
            <Line term="Funded" record={room.registry.find((r) => r.kind === "Funded")}>
              {formatInstantIst(capturedAt)}
            </Line>
          ) : null}
          {m.delivered_at ? (
            <Line
              term="Delivered"
              record={record("Delivered")}
              after={m.delivery_note ? <q className="mt-1 block font-serif italic text-ink-soft">{m.delivery_note}</q> : null}
            >
              {formatInstantIst(m.delivered_at)}
            </Line>
          ) : null}
          {m.status === "delivered" && m.hold_until ? (
            <Line term="Releases">about {formatInstantIst(m.hold_until)}, unless a problem is raised</Line>
          ) : null}
          {m.released_at ? (
            <Line term="Released" record={record("Released")}>
              {formatInstantIst(m.released_at)}
            </Line>
          ) : null}
          {m.refunded_at ? (
            <Line term="Refunded" record={record("Refunded")}>
              <span className="figures">{formatRupees(m.refund_paise)}</span>, {formatInstantIst(m.refunded_at)}
            </Line>
          ) : null}
          {m.status === "cancelled" && cancelled?.created_at ? (
            <Line term="Cancelled" record={cancelled}>
              {formatInstantIst(cancelled.created_at)}
            </Line>
          ) : null}
        </dl>
        {disputes.map((d) => (
          <DisputeNote key={d.id} room={room} dispute={d} records={m.registry} />
        ))}
        {m.actions.length ? (
          <div className="no-print mt-4 flex flex-wrap gap-2">
            {m.actions.map((a) => (
              <RoomAction
                key={a.action}
                action={a}
                room={room}
                milestone={m}
                onDone={async (said) => {
                  setMessage(said);
                  await onChanged();
                }}
              />
            ))}
          </div>
        ) : null}
        {message ? <Notice className="mt-3">{message}</Notice> : null}
      </article>
    </li>
  );
}

/** The milestones as a bahi ledger: numerals in the margin, a red double rule, then each part's history. */
export function MilestoneLedger({ room, onChanged }: { room: Room; onChanged: () => Promise<unknown> }) {
  const allowed = room.revisions_allowed;
  return (
    <section id="milestones" aria-labelledby="milestones-heading" className="scroll-mt-6">
      <h2 id="milestones-heading" className="font-display text-h3 text-ink">
        The milestones
      </h2>
      <p className="m-0 mt-1 text-note text-ink-soft">Each part is paid out on its own, after it’s delivered. Times are IST.</p>
      <div aria-hidden="true" className="label mt-5 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] border-b border-ink/40 pb-1 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
        <span className="pr-3 text-right">No.</span>
        <span className="pl-4">Particulars</span>
        <span>Amount</span>
      </div>
      <ol className="m-0 list-none p-0">
        {room.milestones.map((m) => (
          <MilestoneEntry key={m.id} room={room} milestone={m} onChanged={onChanged} />
        ))}
      </ol>
      {allowed !== null ? (
        <p className="m-0 mt-3 text-note text-ink-soft">
          Revisions: {allowed === "unlimited" ? `unlimited, ${room.revisions_logged} so far` : `${room.revisions_logged} of ${allowed} used`}.
        </p>
      ) : null}
    </section>
  );
}
