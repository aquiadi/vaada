import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { DeskQueue, OpenDispute, ReconciliationFlag, StuckRefund, WebhookFailure, RegistryFailure } from "../books/desk";
import { CELL, DeskSection, DeskTable, FIGURE_CELL } from "../books/DeskTable";
import { DisputeDecision } from "../books/DisputeDecision";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, ButtonLink, Mono, Notice, PageHeader, Waiting } from "../components/ui";
import { formatInstantIst } from "../format/dates";
import { formatRupees } from "../format/money";
import { toRoman } from "../format/roman";
import { ApiError, api } from "../lib/api";
import { explain } from "../lib/errors";
import { NoteField } from "../room/NoteField";

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6";
const TITLE = <title>The desk · Vaada</title>;

const FLAG_KINDS: Record<string, string> = {
  drift: "Drift",
  transfer_failed: "Transfer failed",
  refund_deadline: "Refund window closing",
  refund_stuck: "Refund stuck",
  hold_not_confirmed: "Hold not confirmed",
  payment_on_closed_deal: "Payment on a closed deed",
  fee_exceeded: "Fee above the cap",
  release_stuck: "Release not confirmed",
};

const REFUND_PURPOSES: Record<string, string> = {
  dispute: "A dispute decision",
  cancel: "A cancellation",
  refund: "The Client’s refund",
};

const PAYOUT_STANDING: Record<string, string> = {
  needs_clarification: "Razorpay needs more details",
  under_review: "Under review at Razorpay",
  suspended: "Suspended",
  rejected: "Rejected",
};

const DEAL_STANDING: Record<string, string> = {
  funded: "Paid, not started",
  active: "Under way",
  disputed: "Disputed",
  cancelled: "Cancelled",
};

type Said = { section: string; text: string; tone: "ok" | "error" };

function Deed({ deedNo, dealId }: { deedNo: string; dealId: string }) {
  return (
    <>
      <span className="figures whitespace-nowrap">No. {deedNo}</span>
      <span className="block font-mono text-micro text-ink-soft">{dealId.slice(0, 8)}</span>
    </>
  );
}

function when(iso: string | null): string {
  return iso ? formatInstantIst(iso) : "—";
}

function NothingHere() {
  return (
    <div className={PAGE}>
      <title>Page not found · Vaada</title>
      <PageHeader title="Nothing here" lede="There’s no page at this address." />
      <ButtonLink to="/" tone="plain">
        Vaada’s front page
      </ButtonLink>
    </div>
  );
}

function SaidNotice({ said, section }: { said: Said | null; section: string }) {
  if (!said || said.section !== section) return null;
  return (
    <Notice tone={said.tone} className="figures mb-3">
      {said.text}
    </Notice>
  );
}

function Disputes({ disputes, onDecided }: { disputes: OpenDispute[]; onDecided: (said: string) => Promise<unknown> }) {
  const [deciding, setDeciding] = useState<string | null>(null);
  const decideButtons = useRef(new Map<string, HTMLButtonElement>());
  const open = disputes.find((d) => d.id === deciding);

  function close(id: string) {
    setDeciding(null);
    decideButtons.current.get(id)?.focus();
  }

  return (
    <>
      <DeskTable
        caption="Open disputes, the one whose refund window closes first at the top."
        columns={[
          { label: "Deed" },
          { label: "Milestone" },
          { label: "Amount", figures: true },
          { label: "Raised" },
          { label: "Reason" },
          { label: "Hold" },
          { label: "Refund window closes" },
          { label: "Decision" },
        ]}
      >
        {disputes.map((d) => (
          <tr key={d.id}>
            <td className={CELL}>
              <Deed deedNo={d.deed_no} dealId={d.deal_id} />
            </td>
            <td className={CELL}>{toRoman(d.milestone_idx)}</td>
            <td className={FIGURE_CELL}>{formatRupees(d.amount_paise)}</td>
            <td className={CELL}>
              by the {d.opened_role === "client" ? "Client" : "Maker"}
              <span className="block text-ink-soft">{when(d.opened_at)}</span>
            </td>
            <td className={`${CELL} max-w-[22rem] italic`}>“{d.reason}”</td>
            <td className={CELL}>{d.hold_confirmed ? "Confirmed" : "Not yet confirmed"}</td>
            <td className={`${CELL} figures`}>{d.refund_deadline ? when(d.refund_deadline) : "No captured payment"}</td>
            <td className={CELL}>
              <Button
                ref={(button) => {
                  if (button) decideButtons.current.set(d.id, button);
                  else decideButtons.current.delete(d.id);
                }}
                tone="plain"
                aria-expanded={deciding === d.id}
                aria-controls={deciding === d.id ? `decide-${d.id}` : undefined}
                onClick={() => setDeciding(deciding === d.id ? null : d.id)}
              >
                {deciding === d.id ? "Deciding" : "Decide"}
              </Button>
            </td>
          </tr>
        ))}
      </DeskTable>
      {open ? (
        <div id={`decide-${open.id}`}>
          <DisputeDecision
            key={open.id}
            dispute={open}
            onClose={() => close(open.id)}
            onDecided={async (said) => {
              setDeciding(null);
              await onDecided(said);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function ResolveFlag({ flag, onResolved }: { flag: ReconciliationFlag; onResolved: (said: string) => Promise<unknown> }) {
  const [note, setNote] = useState("");
  return (
    <ConfirmDialog
      trigger={<Button tone="plain">Resolve</Button>}
      title={`Resolve the flag on Deed No. ${flag.deed_no}`}
      effect="This closes the flag with your note on file. No money moves. If the check finds the same problem again, it raises a new flag."
      confirmLabel="Close the flag"
      confirmDisabled={!note.trim()}
      onConfirm={async () => {
        await api.post(`/admin/flags/${flag.id}/resolve`, { note: note.trim() });
        await onResolved(`The flag on Deed No. ${flag.deed_no} is closed.`);
      }}
    >
      <NoteField label="What you found and did" value={note} onChange={setNote} required />
    </ConfirmDialog>
  );
}

function RetryRelease({ flag, milestoneId, onDone }: { flag: ReconciliationFlag; milestoneId: string; onDone: (said: string) => Promise<unknown> }) {
  return (
    <ConfirmDialog
      trigger={<Button tone="plain">Retry the release</Button>}
      title={`Retry the release on Deed No. ${flag.deed_no}`}
      effect="Asks Razorpay again to release what’s left of this milestone to the Maker."
      confirmLabel="Ask Razorpay again"
      onConfirm={async () => {
        const { message } = await api.post<{ message: string }>(`/admin/milestones/${milestoneId}/retry-release`);
        await onDone(message);
      }}
    />
  );
}

function Flags({ flags, caption, onResolved }: { flags: ReconciliationFlag[]; caption: string; onResolved: (said: string) => Promise<unknown> }) {
  return (
    <DeskTable
      caption={caption}
      columns={[{ label: "Deed" }, { label: "Kind" }, { label: "What the check found" }, { label: "First seen" }, { label: "Last seen" }, { label: "Action" }]}
    >
      {flags.map((f) => (
        <tr key={f.id}>
          <td className={CELL}>
            <Deed deedNo={f.deed_no} dealId={f.deal_id} />
          </td>
          <td className={CELL}>{FLAG_KINDS[f.kind] ?? f.kind}</td>
          <td className={`${CELL} max-w-[26rem]`}>{f.summary}</td>
          <td className={`${CELL} figures`}>{when(f.first_seen_at)}</td>
          <td className={`${CELL} figures`}>{when(f.last_seen_at)}</td>
          <td className={CELL}>
            <div className="flex flex-col items-start gap-2">
              {f.kind === "release_stuck" && f.milestone_id ? <RetryRelease flag={f} milestoneId={f.milestone_id} onDone={onResolved} /> : null}
              <ResolveFlag flag={f} onResolved={onResolved} />
            </div>
          </td>
        </tr>
      ))}
    </DeskTable>
  );
}

function StuckRefunds({ refunds, onDone }: { refunds: StuckRefund[]; onDone: (said: Omit<Said, "section">) => Promise<unknown> }) {
  return (
    <DeskTable
      caption="Refunds Razorpay hasn’t completed. Retrying sends the same request again, so a refund can’t go out twice."
      columns={[{ label: "Deed" }, { label: "Milestone" }, { label: "Refund", figures: true }, { label: "Why" }, { label: "Action" }]}
    >
      {refunds.map((r) => (
        <tr key={r.milestone_id}>
          <td className={CELL}>
            <Deed deedNo={r.deed_no} dealId={r.deal_id} />
          </td>
          <td className={CELL}>{toRoman(r.milestone_idx)}</td>
          <td className={FIGURE_CELL}>{formatRupees(r.amount_paise)}</td>
          <td className={CELL}>{(r.purpose && REFUND_PURPOSES[r.purpose]) ?? "Not recorded"}</td>
          <td className={CELL}>
            <ConfirmDialog
              trigger={<Button tone="plain">Retry</Button>}
              title={`Retry the refund on Deed No. ${r.deed_no}`}
              effect={`Vaada asks Razorpay again to refund ${formatRupees(r.amount_paise)} to the Client for Milestone ${toRoman(r.milestone_idx)}, with the same request as before, so it can’t be paid twice.`}
              confirmLabel="Ask Razorpay again"
              onConfirm={async () => {
                const outcome = await api.post<{ completed: boolean; message: string }>(`/admin/milestones/${r.milestone_id}/retry-refund`);
                await onDone({ text: outcome.message, tone: outcome.completed ? "ok" : "error" });
              }}
            />
          </td>
        </tr>
      ))}
    </DeskTable>
  );
}

function RetryRegistry({ record, onDone }: { record: RegistryFailure; onDone: (said: Omit<Said, "section">) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      await api.post(`/admin/registry/${record.id}/retry`);
      await onDone({ text: `The ${record.kind} record for Deed No. ${record.deed_no} is queued again.`, tone: "ok" });
    } catch (caught) {
      await onDone({ text: explain(caught, "That retry didn’t go through. Reload the desk to see where it stands."), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button tone="plain" busy={busy} onClick={() => void retry()}>
      Try again
    </Button>
  );
}

function RegistryFailures({ records, onDone }: { records: RegistryFailure[]; onDone: (said: Omit<Said, "section">) => Promise<unknown> }) {
  return (
    <DeskTable
      caption="Registry writes that failed. Trying again puts the record back in the recorder’s queue; no money is involved."
      columns={[{ label: "Deed" }, { label: "Event" }, { label: "Attempts", figures: true }, { label: "Last error" }, { label: "Action" }]}
    >
      {records.map((r) => (
        <tr key={r.id}>
          <td className={CELL}>
            <Deed deedNo={r.deed_no} dealId={r.deal_id} />
          </td>
          <td className={CELL}>{r.kind}</td>
          <td className={FIGURE_CELL}>{r.attempts}</td>
          <td className={`${CELL} max-w-[26rem]`}>
            <Mono>{r.error ?? "None recorded"}</Mono>
          </td>
          <td className={CELL}>
            <RetryRegistry record={r} onDone={onDone} />
          </td>
        </tr>
      ))}
    </DeskTable>
  );
}

function WebhookFailures({ events, onDone }: { events: WebhookFailure[]; onDone: (said: Omit<Said, "section">) => Promise<unknown> }) {
  return (
    <DeskTable
      caption="Razorpay events that failed to process, oldest first."
      columns={[{ label: "Event" }, { label: "Type" }, { label: "Attempts", figures: true }, { label: "Error" }, { label: "Received" }, { label: "Action" }]}
    >
      {events.map((e) => (
        <tr key={e.event_id}>
          <td className={CELL}>
            <Mono>{e.event_id}</Mono>
          </td>
          <td className={CELL}>
            <Mono>{e.type}</Mono>
          </td>
          <td className={FIGURE_CELL}>{e.attempts}</td>
          <td className={`${CELL} max-w-[24rem]`}>
            <Mono>{e.error ?? "None recorded"}</Mono>
          </td>
          <td className={`${CELL} figures`}>{when(e.received_at)}</td>
          <td className={CELL}>
            <ConfirmDialog
              trigger={<Button tone="plain">Replay</Button>}
              title="Replay this Razorpay event"
              effect={`Vaada runs the ${e.type} event through processing again, as if it had just arrived. Anything it already did is not done twice.`}
              confirmLabel="Replay the event"
              onConfirm={async () => {
                const { processed } = await api.post<{ processed: boolean }>(`/admin/webhooks/${encodeURIComponent(e.event_id)}/replay`);
                await onDone(
                  processed
                    ? { text: `${e.event_id} is processed.`, tone: "ok" }
                    : { text: `${e.event_id} still didn’t process. The error below is the latest.`, tone: "error" },
                );
              }}
            />
          </td>
        </tr>
      ))}
    </DeskTable>
  );
}

function Desk({ queue, asOf }: { queue: DeskQueue; asOf: number }) {
  const client = useQueryClient();
  const [said, setSaid] = useState<Said | null>(null);
  const reportIn = (section: string) => async (message: Omit<Said, "section">) => {
    setSaid({ section, ...message });
    await client.invalidateQueries({ queryKey: ["admin-queue"] });
  };
  const okIn = (section: string) => (text: string) => reportIn(section)({ text, tone: "ok" });

  const transferFailures = queue.flags.filter((f) => f.kind === "transfer_failed");
  const drift = queue.flags.filter((f) => f.kind !== "transfer_failed");

  return (
    <div className={PAGE}>
      {TITLE}
      <PageHeader
        kicker="Desk"
        title="The desk"
        lede="What needs a person. Disputes come first, ordered by how soon Razorpay’s refund window closes on each."
      />
      <p className="-mt-4 mb-10 text-note text-ink-soft">
        Signed in as <Mono>{queue.admin}</Mono>. As of {formatInstantIst(new Date(asOf).toISOString())}. Deed numbers are shown without links: a deal room opens only for its two parties.
      </p>

      <DeskSection n={1} id="desk-disputes" title="Disputes, by refund deadline" count={queue.disputes.length} nothing="No dispute is open." notice={<SaidNotice said={said} section="disputes" />}>
        <Disputes disputes={queue.disputes} onDecided={okIn("disputes")} />
      </DeskSection>

      <DeskSection n={2} id="desk-drift" title="Reconciliation drift" count={drift.length} nothing="Vaada’s books and Razorpay’s agree." notice={<SaidNotice said={said} section="drift" />}>
        <Flags flags={drift} caption="Where Vaada’s books and Razorpay’s disagree, oldest first." onResolved={okIn("drift")} />
      </DeskSection>

      <DeskSection n={3} id="desk-transfers" title="Failed transfers" count={transferFailures.length} nothing="No transfer has failed." notice={<SaidNotice said={said} section="transfers" />}>
        <Flags flags={transferFailures} caption="Transfers to Makers that Razorpay refused, oldest first." onResolved={okIn("transfers")} />
      </DeskSection>

      <DeskSection n={4} id="desk-refunds" title="Refunds that haven’t gone through" count={queue.stuck_refunds.length} nothing="No refund is stuck." notice={<SaidNotice said={said} section="refunds" />}>
        <StuckRefunds refunds={queue.stuck_refunds} onDone={reportIn("refunds")} />
      </DeskSection>

      <DeskSection n={5} id="desk-registry" title="Failed registry writes" count={queue.registry_failures.length} nothing="Every registry write has gone through." notice={<SaidNotice said={said} section="registry" />}>
        <RegistryFailures records={queue.registry_failures} onDone={reportIn("registry")} />
      </DeskSection>

      <DeskSection n={6} id="desk-webhooks" title="Razorpay events that failed" count={queue.webhook_failures.length} nothing="Every Razorpay event has been processed." notice={<SaidNotice said={said} section="webhooks" />}>
        <WebhookFailures events={queue.webhook_failures} onDone={reportIn("webhooks")} />
      </DeskSection>

      <DeskSection n={7} id="desk-payouts" title="Payout accounts needing attention" count={queue.payout_accounts.length} nothing="Every payout account is in order.">
        <DeskTable
          caption="Makers’ Razorpay accounts that are under review, need details, or are stopped."
          columns={[{ label: "Legal name" }, { label: "Standing" }, { label: "What Razorpay asks for" }, { label: "Updated" }]}
        >
          {queue.payout_accounts.map((a) => (
            <tr key={a.user_id}>
              <td className={CELL}>
                {a.legal_name ?? "Not given"}
                <span className="block font-mono text-micro text-ink-soft">{a.user_id.slice(0, 8)}</span>
              </td>
              <td className={CELL}>{PAYOUT_STANDING[a.status] ?? a.status}</td>
              <td className={`${CELL} max-w-[26rem]`}>
                {a.requirements?.length ? (
                  <ul className="m-0 list-none p-0">
                    {a.requirements.map((r, i) => (
                      <li key={`${r.field_reference ?? r.reason_code ?? "requirement"}-${i}`}>
                        {r.description ?? r.reason_code ?? r.field_reference}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "Nothing listed"
                )}
              </td>
              <td className={`${CELL} figures`}>{when(a.updated_at)}</td>
            </tr>
          ))}
        </DeskTable>
      </DeskSection>

      <DeskSection n={8} id="desk-windows" title="Refund windows on paid deeds" count={queue.refund_deadlines.length} nothing="No paid deed is open.">
        <DeskTable
          caption="Razorpay can refund a payment only for a limited time after it is captured. Earliest deadline first."
          columns={[{ label: "Deed" }, { label: "Standing" }, { label: "Paid" }, { label: "Refund window closes" }]}
        >
          {queue.refund_deadlines.map((w) => (
            <tr key={w.deal_id}>
              <td className={CELL}>
                <Deed deedNo={w.deed_no} dealId={w.deal_id} />
              </td>
              <td className={CELL}>{DEAL_STANDING[w.status] ?? w.status}</td>
              <td className={`${CELL} figures`}>{when(w.captured_at)}</td>
              <td className={`${CELL} figures`}>{when(w.refund_deadline)}</td>
            </tr>
          ))}
        </DeskTable>
      </DeskSection>
    </div>
  );
}

export default function Admin() {
  const query = useQuery({ queryKey: ["admin-queue"], queryFn: () => api.get<DeskQueue>("/admin/queue") });
  if (query.isPending) {
    return (
      <>
        {TITLE}
        <Waiting>Opening the desk.</Waiting>
      </>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) return <NothingHere />;
    return (
      <div className={PAGE}>
        {TITLE}
        <Notice tone="error">{explain(query.error, "The desk didn’t load. Try again in a moment.")}</Notice>
        <Button tone="plain" className="mt-4" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <Desk queue={query.data} asOf={query.dataUpdatedAt} />;
}
