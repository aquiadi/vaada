import { Link } from "react-router";
import { daysInWords, percentFromBps, usePolicyNumbers } from "./policyNumbers";
import { Clause, Items, PolicySheet } from "./PolicySheet";

export function RefundPolicy() {
  const n = usePolicyNumbers();
  return (
    <PolicySheet
      slug="refunds"
      lede="When money goes back to the client, how it gets there, and how long it takes. Vaada is for services, so nothing is returned by post; refunds follow the deed."
    >
      <Clause n={1} title="How the money is held">
        <p>
          When a client pays for a deed, Razorpay holds the whole deal total and releases it to the maker one part at a time. Until a
          part is released, its money can still go back to the client in the cases below. Once a part is released, its money can’t be
          pulled back through Vaada.
        </p>
      </Clause>

      <Clause n={2} title="A part that isn’t delivered">
        <p>
          If the maker hasn’t marked a part delivered within {daysInWords(n.graceDays)} after its due date, the client may ask for that
          part’s money back from the deal room. The whole amount of that part is refunded; it doesn’t need the maker’s agreement.
          Before anything happens, the client is shown exactly what will be refunded and where it will go.
        </p>
      </Clause>

      <Clause n={3} title="Ending a deed early by agreement">
        <p>Either party may propose ending a deed early, and it ends when the other agrees on Vaada. Then:</p>
        <Items
          items={[
            <>money for parts not yet delivered goes back to the client, less any kill fee the deed gives the maker;</>,
            <>parts already delivered finish their review as usual, and are approved, disputed, or released when the review ends;</>,
            <>money already released stays released.</>,
          ]}
        />
      </Clause>

      <Clause n={4} title="After a dispute">
        <p>
          If Vaada decides a dispute about a delivered part wholly or partly in the client’s favour, the client’s share goes back to
          them in the same way as any other refund. The reasons are written to both parties.
        </p>
      </Clause>

      <Clause n={5} title="What isn’t refunded">
        <Items
          items={[
            <>
              The processing fee, <span className="figures">{percentFromBps(n.clientFeeBps)}</span> of the deal total. It pays the
              payment gateway’s charges, which are spent the moment the payment is made, so it isn’t refunded even when the whole deal
              total is.
            </>,
            <>Money already released to the maker.</>,
            <>A late fee, or anything else the parties settle directly between themselves rather than through Vaada.</>,
          ]}
        />
      </Clause>

      <Clause n={6} title="How and when a refund arrives">
        <p>
          A refund goes back through Razorpay to the same card, bank account or UPI account that paid. It usually arrives within five
          to seven working days, depending on the bank. We can’t send a refund anywhere else.
        </p>
        <p>
          A deal runs at most {daysInWords(n.maxDealDays)} from when it is sent, so every refund is made well within the six months
          banks allow for refunding a payment.
        </p>
        <p>
          If a refund hasn’t arrived after seven working days, <Link to="/legal/contact">write to us</Link> with the deed’s link, and
          we will trace it with Razorpay.
        </p>
      </Clause>
    </PolicySheet>
  );
}
