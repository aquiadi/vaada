import { useState, type ReactNode } from "react";
import { agreementHash } from "../agreement/canonical";
import { Mono } from "../components/ui";
import { DeedSheet } from "../design/DeedSheet";
import { Struck } from "../design/Strike";
import { formatInstantIst, formatIsoDate, istDateOf } from "../format/dates";
import { formatRupees } from "../format/money";
import type { Acceptance, Agreement, RegistryEntry } from "../lib/types";
import { numberWord, type StrikableKey } from "./blanks";
import { DeedBody, DeedDisclaimers, type DeedFacts, type DeedSlots } from "./DeedText";
import { agreementSummary } from "./summary";

const CLAUSE_OF: Array<[string, StrikableKey]> = [
  ["client_organisation", "client_organisation"],
  ["late_fee.", "late_fee"],
  ["kill_fee.", "kill_fee"],
  ["ip_transfer.", "ip_transfer"],
];

function clauseOf(key: string): StrikableKey | null {
  return CLAUSE_OF.find(([prefix]) => key.startsWith(prefix))?.[1] ?? null;
}

function valueOf(a: Agreement, key: string): string {
  const m = /^milestones\.(\d+)\.(\w+)$/.exec(key);
  if (m) {
    const part = a.milestones[Number(m[1]) - 1];
    if (!part) return "";
    switch (m[2]) {
      case "title":
        return part.title;
      case "amount":
        return formatRupees(Number(part.amount_paise));
      case "deliverables":
        return part.deliverables;
      case "due":
        return formatIsoDate(istDateOf(part.due_at));
    }
    return "";
  }
  switch (key) {
    case "maker_name":
      return a.maker.name;
    case "client_name":
      return a.client.name;
    case "client_organisation":
      return a.client.organisation ?? "";
    case "work":
      return a.work.description;
    case "revisions":
      return a.work.revisions === "unlimited" ? "unlimited" : numberWord(a.work.revisions);
    case "total":
      return formatRupees(Number(a.money.total_paise));
    case "plan":
      return a.milestones.map((p) => p.title).join(", ").replace(/, ([^,]*)$/, " and $1");
    case "late_fee.days":
      return a.clauses.late_fee ? `${numberWord(a.clauses.late_fee.days)} days` : "";
    case "late_fee.amount":
      return a.clauses.late_fee ? formatRupees(Number(a.clauses.late_fee.amount_paise)) : "";
    case "kill_fee.percent":
      return a.clauses.kill_fee ? `${a.clauses.kill_fee.percent}%` : "";
    case "ip_transfer.exclusions":
      return a.clauses.ip_transfer?.exclusions ?? "";
  }
  return "";
}

export function agreementSlots(a: Agreement, struck: readonly string[]): DeedSlots {
  const isStruck = (key: StrikableKey) =>
    struck.includes(key) || (key === "client_organisation" ? !a.client.organisation : a.clauses[key] === null);
  return {
    struck,
    milestoneCount: a.milestones.length,
    margin: () => null,
    blank: (key) => {
      const clause = clauseOf(key);
      if (clause && isStruck(clause)) return <span aria-hidden="true">________</span>;
      return <span className="filled text-ink">{valueOf(a, key)}</span>;
    },
    clause: (key, children) => (isStruck(key) ? <Struck seed={`${a.nonce}-${key}`}>{children}</Struck> : children),
  };
}

export function factsFromAgreement(a: Agreement): DeedFacts {
  return {
    madeOn: istDateOf(a.published_at),
    totalPaise: Number(a.money.total_paise),
    clientFeePaise: Number(a.money.client_fee_paise),
    reviewDays: a.policy.review_window_days,
    bufferHours: a.policy.hold_buffer_hours,
    graceDays: a.policy.grace_days,
  };
}

function VerifyHash({ agreement, hash }: { agreement: Agreement; hash: string }) {
  const [result, setResult] = useState<"match" | "mismatch" | null>(null);
  return (
    <span>
      <button
        type="button"
        onClick={() => setResult(agreementHash(agreement) === hash ? "match" : "mismatch")}
        className="smallcaps cursor-pointer border-0 bg-transparent p-0 text-micro text-ink underline"
      >
        Verify
      </button>
      {result ? (
        <span role="status" className={`ml-2 text-micro ${result === "match" ? "text-stamp" : "text-bahi"}`}>
          {result === "match"
            ? "Matches. Your browser rebuilt the hash from the terms on this page."
            : "Doesn't match. The terms on this page differ from the ones that were frozen."}
        </span>
      ) : null}
    </span>
  );
}

export function RegistryLink({ entry }: { entry: RegistryEntry | undefined }) {
  if (!entry) return null;
  if (entry.status !== "confirmed") return <span className="text-micro italic text-ink-soft">Recording…</span>;
  if (entry.tx_url)
    return (
      <a href={entry.tx_url} target="_blank" rel="noreferrer" className="text-micro">
        On Polygonscan
      </a>
    );
  return (
    <span className="text-micro text-ink-soft">
      Recorded on the local chain <Mono>{entry.tx_hash?.slice(0, 10)}…</Mono>
    </span>
  );
}

interface Props {
  agreement: Agreement;
  hash: string;
  struck: readonly string[];
  accepted: Acceptance | null;
  registry: RegistryEntry[];
  compact?: boolean;
  seal?: ReactNode;
}

/** A published deed: summary, the full text from the frozen terms, and the evidence at its foot. */
export function PublishedDeed({ agreement, hash, struck, accepted, registry, compact = false, seal }: Props) {
  const published = registry.find((r) => r.kind === "Published");
  return (
    <DeedSheet deedNo={agreement.deed_no} compact={compact}>
      <p className="label m-0 mb-1">In short</p>
      <p className="measure m-0 mb-6 text-body italic text-ink-soft">{agreementSummary(agreement)}</p>
      <hr className="rule-double mb-6" />
      <DeedBody s={agreementSlots(agreement, struck)} facts={factsFromAgreement(agreement)} />
      <hr className="rule-double my-6" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          {accepted ? (
            <p className="m-0 text-body text-ink">
              Accepted by {accepted.name} ({accepted.email_masked}) on {formatInstantIst(accepted.at)}.
            </p>
          ) : (
            <p className="m-0 text-body italic text-ink-soft">Not yet accepted.</p>
          )}
          <DeedDisclaimers />
          <dl className="m-0 space-y-1 text-micro text-ink-soft">
            <div>
              <dt className="label inline">Agreement hash </dt>
              <dd className="m-0 inline">
                <Mono className="text-ink">{hash}</Mono>
              </dd>
            </div>
            <div>
              <dt className="label inline">Nonce </dt>
              <dd className="m-0 inline">
                <Mono className="text-ink">{agreement.nonce}</Mono>
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <VerifyHash agreement={agreement} hash={hash} />
              <RegistryLink entry={published} />
            </div>
          </dl>
        </div>
        {seal ? <div className="justify-self-center md:justify-self-end">{seal}</div> : null}
      </div>
    </DeedSheet>
  );
}
