import { Link } from "react-router";
import { numberWord } from "../deed/blanks";
import { formatInstantIst } from "../format/dates";
import { daysInWords, hoursInWords, usePolicyNumbers, type PolicyNumbers } from "./policyNumbers";
import { Clause, Items, PolicySheet } from "./PolicySheet";

const EXAMPLE_DELIVERED_AT = "2026-10-12T08:30:00Z";
const HOUR_MS = 3_600_000;

function laterBy(isoInstant: string, hours: number): string {
  return new Date(Date.parse(isoInstant) + hours * HOUR_MS).toISOString();
}

function ExampleTimeline({ n }: { n: PolicyNumbers }) {
  const reviewEnds = laterBy(EXAMPLE_DELIVERED_AT, n.reviewDays * 24);
  const released = laterBy(reviewEnds, n.holdBufferHours);
  const rows: Array<[string, string]> = [
    ["The maker marks part I delivered", formatInstantIst(EXAMPLE_DELIVERED_AT)],
    ["The review ends; no dispute can be raised after this", formatInstantIst(reviewEnds)],
    ["The money is released, if the client hasn’t approved it sooner", formatInstantIst(released)],
    ["It reaches the maker’s bank", "On Razorpay’s next settlement, usually within two working days"],
  ];
  return (
    <table className="w-full border-collapse text-note">
      <caption className="pb-2 text-left text-note italic text-ink-soft">An example, for one part of a deed.</caption>
      <thead>
        <tr className="border-b hairline">
          <th scope="col" className="label pb-2 pr-4 text-left font-medium">
            What happens
          </th>
          <th scope="col" className="label pb-2 text-left font-medium">
            When
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([step, when]) => (
          <tr key={step} className="border-b hairline">
            <th scope="row" className="py-2 pr-4 text-left align-top font-normal text-ink">
              {step}
            </th>
            <td className="figures py-2 align-top text-ink">{when}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DeliveryPolicy() {
  const n = usePolicyNumbers();
  const review = numberWord(n.reviewDays);
  return (
    <PolicySheet
      slug="delivery"
      lede="Vaada sells no physical goods and ships nothing. What a maker delivers is a service; this is what delivered means here, and when money moves."
    >
      <Clause n={1} title="Nothing is shipped">
        <p>
          Vaada is a platform for agreements between freelancers and their clients. No physical goods are sold or shipped through it,
          and there are no shipping charges. The work itself, whether a design, code, writing or anything else, is handed over by the
          maker to the client in the way the two of them agreed, usually by email or a shared link.
        </p>
      </Clause>

      <Clause n={2} title="How a deed reaches you">
        <p>
          A deed is delivered electronically. The client receives its link by email as soon as the maker sends it, and both parties are
          emailed at each step that needs their attention. The deed, and everything that has happened under it, can be read in its deal
          room at any time, and printed.
        </p>
      </Clause>

      <Clause n={3} title="What delivered means">
        <Items
          items={[
            <>
              A part of the work is delivered when the maker marks it delivered in the deal room, with a note if they wish. The client
              is told by email.
            </>,
            <>
              Marking a part delivered says the maker has handed over what the deed lists for that part. It starts the client’s review;
              it doesn’t by itself release any money.
            </>,
            <>
              If the client finds that the work wasn’t handed over, or doesn’t match the deed, they can raise a dispute during the
              review, and the money stays held until Vaada decides.
            </>,
          ]}
        />
      </Clause>

      <Clause n={4} title="When money moves">
        <Items
          items={[
            <>
              The client pays the whole deal total and the processing fee within {daysInWords(n.acceptPayDays)} of accepting, and
              before the first part is due. Razorpay holds it.
            </>,
            <>The maker marks a part delivered. Its money stays held.</>,
            <>The client has {review} days to approve the part or raise a dispute.</>,
            <>
              If the client approves, the part’s money is released at once. If the client does neither, it is released{" "}
              {hoursInWords(n.holdBufferHours)} after the {review} days end.
            </>,
            <>
              Released money is queued for Razorpay’s next settlement to the maker’s bank, usually within two working days. Released
              means on its way; it doesn’t mean the money is in the bank yet.
            </>,
          ]}
        />
        <ExampleTimeline n={n} />
      </Clause>

      <Clause n={5} title="Late or disputed work">
        <p>
          If a part isn’t delivered within {daysInWords(n.graceDays)} after its due date, the client may ask for that part’s money back;{" "}
          <Link to="/legal/refunds">Refunds and cancellations</Link> explains how. Either party may raise a dispute about a delivered
          part before its review ends, and the money stays held until Vaada decides to release it, refund it or split it.
        </p>
        <p>
          A deal runs at most {daysInWords(n.maxDealDays)} from when it is sent, so no deed keeps money waiting indefinitely.
        </p>
      </Clause>
    </PolicySheet>
  );
}
