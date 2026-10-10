import type { ReactNode } from "react";
import { formatDeedDate } from "../format/dates";
import { formatRupees, rupeesInWords } from "../format/money";
import { toRoman } from "../format/roman";
import { SectionMark } from "../components/ui";
import type { StrikableKey } from "./blanks";

/**
 * The deed, written once. The editor fills `slots` with inputs and marginalia; a published deed fills them
 * with frozen text. Plain formal English, short enough to read in one sitting.
 */
export interface DeedSlots {
  blank(key: string): ReactNode;
  clause(key: StrikableKey, children: ReactNode): ReactNode;
  /** Marginalia for the blanks in one paragraph. Null when the deed is read, not edited. */
  margin(keys: string[]): ReactNode;
  milestoneCount: number;
  milestoneControls?(i: number): ReactNode;
  afterMilestones?: ReactNode;
  struck: readonly string[];
}

export interface DeedFacts {
  madeOn: string;
  totalPaise: number | null;
  clientFeePaise: number | null;
  reviewDays: number;
  bufferHours: number;
  graceDays: number;
}

/** A paragraph and its outer margin. On narrow screens the margin drops below the line. */
export function Para({ children, margin, dropCap = false, id }: { children: ReactNode; margin?: ReactNode; dropCap?: boolean; id?: string }) {
  return (
    <div id={id} className="grid grid-cols-1 gap-x-8 md:grid-cols-[minmax(0,68ch)_13rem]">
      <p className={`m-0 mb-4 text-deed text-ink [hyphens:manual] ${dropCap ? "drop-cap" : ""}`}>{children}</p>
      <div className="mb-4 md:mb-0">{margin}</div>
    </div>
  );
}

function feeSentence(facts: DeedFacts): string {
  if (facts.clientFeePaise === null) return "together with a processing fee that covers the payment gateway's charges";
  return `together with a processing fee of ${formatRupees(facts.clientFeePaise)} that covers the payment gateway's charges`;
}

export function DeedBody({ s, facts }: { s: DeedSlots; facts: DeedFacts }) {
  const parts = Array.from({ length: s.milestoneCount }, (_, i) => i + 1);
  const reviewWords = facts.reviewDays === 5 ? "five" : String(facts.reviewDays);
  const graceWords = facts.graceDays === 3 ? "three" : String(facts.graceDays);
  const bufferText = facts.bufferHours === 24 ? "one day" : `${facts.bufferHours} hours`;

  return (
    <div className="deed">
      <SectionMark n={1} title="The parties" />
      <Para dropCap margin={s.margin(["maker_name", "client_name", "client_organisation"])}>
        This agreement is made on {formatDeedDate(facts.madeOn)}, between {s.blank("maker_name")}, hereinafter the Maker, and{" "}
        {s.blank("client_name")}
        {s.clause("client_organisation", <> of {s.blank("client_organisation")}</>)}, hereinafter the Client.
      </Para>

      <SectionMark n={2} title="The work" />
      <Para margin={s.margin(["work", "revisions"])}>
        The Maker shall deliver {s.blank("work")}, in the parts set out under The money below. For each part the Client may ask for
        up to {s.blank("revisions")} rounds of revision; anything more is by fresh agreement.
      </Para>
      <Para margin={s.margin(["ip_transfer.exclusions"])}>
        {s.clause(
          "ip_transfer",
          <>
            When every part has been paid for, the Maker transfers to the Client the copyright in the final work delivered, except{" "}
            {s.blank("ip_transfer.exclusions")}.
          </>,
        )}
      </Para>

      <SectionMark n={3} title="The money" />
      <Para margin={s.margin(["total", "plan"])}>
        The Client shall pay a total of {s.blank("total")}
        {facts.totalPaise ? <span className="text-ink-soft"> ({rupeesInWords(facts.totalPaise)})</span> : null}, in these parts:{" "}
        {s.blank("plan")}.
      </Para>
      <ol className="m-0 mb-4 list-none p-0" aria-label="The parts of the work and their payments">
        {parts.map((i) => (
          <li key={i}>
            <Para margin={s.margin([`milestones.${i}.title`, `milestones.${i}.amount`, `milestones.${i}.deliverables`, `milestones.${i}.due`])}>
              <span className="mr-1 inline-block min-w-[2.5em] font-display text-[1.125rem] text-ink-soft" aria-hidden="true">
                ({toRoman(i).toLowerCase()})
              </span>
              <span className="sr-only">Part {i}. </span>
              {s.blank(`milestones.${i}.title`)}: {s.blank(`milestones.${i}.amount`)}, for {s.blank(`milestones.${i}.deliverables`)},
              due by {s.blank(`milestones.${i}.due`)}.{s.milestoneControls?.(i)}
            </Para>
          </li>
        ))}
      </ol>
      {s.afterMilestones}
      <Para>
        The Client pays the whole total at the start, {feeSentence(facts)}; that fee is not refundable. Razorpay holds the money;
        Vaada never does. Every part, an advance included, stays held until the Client approves it or its review period ends, and
        only then goes to the Maker.
      </Para>
      <Para margin={s.margin(["late_fee.days", "late_fee.amount"])}>
        {s.clause(
          "late_fee",
          <>
            If the Client keeps the Maker waiting for feedback or materials for more than {s.blank("late_fee.days")} at a time, the
            Client shall pay a late fee of {s.blank("late_fee.amount")} for each further week of waiting. This fee is settled between
            the parties directly; Vaada does not hold it.
          </>,
        )}
      </Para>

      <SectionMark n={4} title="The dates" />
      <Para>
        The Maker shall deliver each part by the date written against it. When the Maker marks a part delivered, the Client has{" "}
        {reviewWords} days to approve it or to raise a problem. If the Client does neither, the money for that part is released to
        the Maker {bufferText} after those {reviewWords} days end. Released money reaches the Maker's bank on Razorpay's next
        settlement. A date moves only if both parties agree to it on Vaada.
      </Para>

      <SectionMark n={5} title="If things go wrong" />
      <Para>
        If a part is not delivered within {graceWords} days after its due date, the Client may ask for that part's money back, and
        Razorpay returns it, less the processing fee. Either party may raise a dispute about a delivered part during its review
        period; the money then stays held until Vaada decides to release it, return it or divide it, and writes to both parties
        with its reasons. The parties may end the rest of this deed by agreeing to on Vaada: money for work not yet delivered goes
        back to the Client, and money already released stays released.
      </Para>
      <Para margin={s.margin(["kill_fee.percent"])}>
        {s.clause(
          "kill_fee",
          <>
            If the Client asks to end this deed before the work is delivered and the Maker agrees, the Maker keeps{" "}
            {s.blank("kill_fee.percent")} of each undelivered part as a kill fee.
          </>,
        )}
      </Para>
    </div>
  );
}

/** The three things every deed says at its foot. */
export function DeedDisclaimers() {
  return (
    <ul className="m-0 list-none space-y-1 p-0 text-note text-ink-soft">
      <li>Vaada helps people write down what they agreed, and isn't a lawyer.</li>
      <li>This deed is not stamped under the Indian Stamp Act.</li>
      <li>Vaada's decisions on disputes settle the money held here, and don't stop either party going to court.</li>
    </ul>
  );
}
