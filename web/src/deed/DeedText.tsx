import type { ReactNode } from "react";
import { formatDeedDate } from "../format/dates";
import { formatRupees, rupeesInWords } from "../format/money";
import { toRoman } from "../format/roman";
import { SectionMark } from "../components/ui";
import { hoursInWords, numberWord, type StrikableKey } from "./blanks";

/**
 * The deed, written once. The editor fills `slots` with inputs and marginalia; a published deed fills them
 * with frozen text. Plain formal English, short enough to read in one sitting.
 */
export interface DeedSlots {
  blank(key: string): ReactNode;
  clause(key: StrikableKey, children: ReactNode): ReactNode;
  /** Marginalia for the blanks in one paragraph. Null when the deed is read, not edited: it then has no margin at all. */
  margin: ((keys: string[]) => ReactNode) | null;
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

/**
 * A paragraph and its outer margin. On narrow screens the margin drops below the line. The text takes its full
 * measure first and the margin takes what is left, so notes on a wide sheet stay short and leave no holes in the deed.
 * Without a margin (a deed that is read, not edited) there is no margin column, so a printed deed keeps the page's width.
 */
export function Para({ children, margin, dropCap = false, id }: { children: ReactNode; margin?: ReactNode; dropCap?: boolean; id?: string }) {
  const text = <p className={`m-0 mb-4 max-w-[68ch] text-deed text-ink [hyphens:manual] ${dropCap ? "drop-cap" : ""}`}>{children}</p>;
  if (margin === undefined) return <div id={id}>{text}</div>;
  return (
    <div id={id} className="grid grid-cols-1 gap-x-8 md:grid-cols-[minmax(0,68ch)_minmax(13rem,1fr)]">
      {text}
      <div className="mb-4 md:mb-0 md:max-w-[24rem]">{margin}</div>
    </div>
  );
}

function feeSentence(facts: DeedFacts): string {
  if (facts.clientFeePaise === null) return "together with a processing fee that covers the payment gateway's charges";
  // With Razorpay's customer-fee model Vaada charges nothing on top, and Razorpay shows its own charge at checkout.
  if (facts.clientFeePaise === 0) return "together with any charge Razorpay adds at checkout";
  return `together with a processing fee of ${formatRupees(facts.clientFeePaise)} that covers the payment gateway's charges`;
}

/** A late part comes back whole: the processing fee was paid on top of the total, and it is the only thing kept. */
function refundSentence(facts: DeedFacts): string {
  // With Razorpay's customer-fee model there is no processing fee of Vaada's to keep.
  if (facts.clientFeePaise === 0) return "Razorpay returns it in full";
  return "Razorpay returns it in full; the processing fee is not refunded";
}

export function DeedBody({ s, facts }: { s: DeedSlots; facts: DeedFacts }) {
  const parts = Array.from({ length: s.milestoneCount }, (_, i) => i + 1);
  const reviewWords = numberWord(facts.reviewDays);
  const graceWords = numberWord(facts.graceDays);
  const bufferText = hoursInWords(facts.bufferHours);
  // While the deed is edited every paragraph keeps the margin column, even an empty one, so the text has one measure.
  const margin = (keys: string[]) => (s.margin ? s.margin(keys) : undefined);

  return (
    <div className="deed">
      <SectionMark n={1} title="The parties" />
      <Para dropCap margin={margin(["maker_name", "client_name", "client_organisation"])}>
        This agreement is made on {formatDeedDate(facts.madeOn)}, between {s.blank("maker_name")}, hereinafter the Maker, and{" "}
        {s.blank("client_name")}
        {s.clause("client_organisation", <> of {s.blank("client_organisation")}</>)}, hereinafter the Client.
      </Para>

      <SectionMark n={2} title="The work" />
      <Para margin={margin(["work", "revisions"])}>
        The Maker shall deliver {s.blank("work")}, in the parts set out under The money below. For each part the Client may ask for
        up to {s.blank("revisions")} rounds of revision; anything more is by fresh agreement.
      </Para>
      <Para margin={margin(["ip_transfer.exclusions"])}>
        {s.clause(
          "ip_transfer",
          <>
            When every part has been paid for, the Maker transfers to the Client the copyright in the final work delivered, except{" "}
            {s.blank("ip_transfer.exclusions")}.
          </>,
        )}
      </Para>

      <SectionMark n={3} title="The money" />
      <Para margin={margin(["total", "plan"])}>
        The Client shall pay a total of {s.blank("total")}
        {facts.totalPaise ? <span className="text-ink-soft"> ({rupeesInWords(facts.totalPaise)})</span> : null}, in these parts:{" "}
        {s.blank("plan")}.
      </Para>
      <ol className="m-0 mb-4 list-none p-0" aria-label="The parts of the work and their payments">
        {parts.map((i) => (
          <li key={i}>
            <Para margin={margin([`milestones.${i}.title`, `milestones.${i}.amount`, `milestones.${i}.deliverables`, `milestones.${i}.due`])}>
              <span className="mr-1 inline-block min-w-[2.5em] text-ink-soft" aria-hidden="true">
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
      <Para margin={margin([])}>
        The Client pays the whole total at the start, {feeSentence(facts)}; that fee is not refundable. Razorpay holds the money;
        Vaada never does. Every part, an advance included, stays held until the Client approves it or its review period ends, and
        only then goes to the Maker.
      </Para>
      <Para margin={margin(["late_fee.days", "late_fee.amount"])}>
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
      <Para margin={margin([])}>
        The Maker shall deliver each part by the date written against it. When the Maker marks a part delivered, the Client has{" "}
        {reviewWords} days to approve it or to raise a problem. If the Client does neither, the money for that part is released to
        the Maker {bufferText} after those {reviewWords} days end. Released money reaches the Maker's bank on Razorpay's next
        settlement. A date moves only if both parties agree to it on Vaada.
      </Para>

      <SectionMark n={5} title="If things go wrong" />
      <Para margin={margin([])}>
        If a part is not delivered within {graceWords} days after its due date, the Client may ask for that part's money back, and{" "}
        {refundSentence(facts)}. Either party may raise a dispute about a delivered part during its review period; the money then
        stays held until Vaada decides to release it, return it or divide it, and writes to both parties with its reasons. The
        parties may end the rest of this deed by agreeing to do so on Vaada: money for work not yet delivered goes back to the Client,
        and money already released stays released.
      </Para>
      <Para margin={margin(["kill_fee.percent"])}>
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
