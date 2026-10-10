import { Link } from "react-router";
import { Rupees } from "../components/ui";
import { numberWord } from "../deed/blanks";
import { Clause, Items, Placeholder, PolicySheet } from "./PolicySheet";
import { daysInWords, hoursInWords, percentFromBps, usePolicyNumbers } from "./policyNumbers";

export function TermsOfUse() {
  const n = usePolicyNumbers();
  const review = numberWord(n.reviewDays);
  return (
    <PolicySheet slug="terms" lede="The agreement between you and Vaada when you write a deed here, accept one, or pay for one.">
      <Clause n={1} title="What Vaada is">
        <p>
          Vaada is a service for freelancers and their clients to write down a deal, called a deed, and to have the money for it
          collected, held and paid out in parts by Razorpay, our payment gateway. Vaada is operated by{" "}
          <Placeholder>Legal entity name to be added</Placeholder>, whose registered address is on our{" "}
          <Link to="/legal/contact">contact page</Link>.
        </p>
        <p>
          In these terms a maker is the freelancer who writes and sends a deed, and a client is the person or business who accepts it
          and pays. ‘We’ and ‘us’ mean Vaada. By using Vaada you agree to these terms and to our{" "}
          <Link to="/legal/privacy">privacy</Link>, <Link to="/legal/refunds">refund</Link> and{" "}
          <Link to="/legal/delivery">delivery</Link> policies.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <Items
          items={[
            <>
              You must be at least eighteen and able to make a binding contract under Indian law. If you use Vaada for a business, you
              confirm that you may agree to these terms on its behalf.
            </>,
            <>
              You sign in with a one-time code sent to your email. Keep that email to yourself: whatever is done after a correct code
              is treated as done by you.
            </>,
            <>Give true details, above all your name on a deed and, as a maker, your tax and bank details to Razorpay.</>,
            <>
              Vaada is for paying for services between a freelancer and a client. Don’t use it to sell goods, to move money that isn’t
              payment for real work, or for anything the law or Razorpay’s terms forbid.
            </>,
          ]}
        />
      </Clause>

      <Clause n={3} title="Deeds">
        <Items
          items={[
            <>
              A maker writes a deed on Vaada and sends its link to the client. Once sent, its text is frozen and fingerprinted by a
              hash, so either of you can check later that not a word has changed.
            </>,
            <>
              When the client accepts it, by typing their name and ticking to agree, the deed becomes a contract between the maker and
              the client, made electronically as the Information Technology Act, 2000 allows. Vaada is not a party to it, except that
              both of you agree in it that Vaada may decide disputes about the money held for it (§ 7 below).
            </>,
            <>
              Deeds are not stamped under the Indian Stamp Act, 1899. If your work or your state calls for a stamped agreement, have
              one made separately.
            </>,
            <>
              Vaada isn’t a lawyer and doesn’t give legal advice. The deed is plain and general; whether it suits your work is for you
              to judge, and you are welcome to take advice before you send or accept one.
            </>,
            <>
              A deal must total at least <Rupees paise={n.minDealPaise} /> and can run at most {daysInWords(n.maxDealDays)} from when
              it is sent. A due date moves only when both of you agree to the change on Vaada.
            </>,
            <>
              An accepted deed must be paid within {daysInWords(n.acceptPayDays)} of acceptance, and before its first part is due, or
              it lapses and nobody owes anything under it.
            </>,
          ]}
        />
      </Clause>

      <Clause n={4} title="Paying">
        <Items
          items={[
            <>
              The client pays the whole deal total at the start, together with a processing fee of{" "}
              <span className="figures">{percentFromBps(n.clientFeeBps)}</span> of the total that covers the payment gateway’s
              charges. The fee is shown on its own line before payment and is not refundable. <Link to="/pricing">Pricing</Link> has a
              worked example.
            </>,
            <>
              Payment is made through Razorpay Checkout by UPI, netbanking, or a debit or credit card issued in India on Visa,
              Mastercard or RuPay. EMI, wallets, international cards, American Express and Diners Club aren’t accepted, and UPI isn’t
              offered for amounts above <Rupees paise={n.upiLimitPaise} />.
            </>,
            <>
              Razorpay collects the money and holds it. Vaada never holds your money in its own bank account, and never uses
              cryptocurrency for payments.
            </>,
            <>
              To be paid, a maker completes Razorpay’s checks and gives it a bank account in their own name. Razorpay may delay or
              refuse a payout under its own terms or the law, and Vaada can’t overrule it.
            </>,
            <>Each of you is responsible for your own taxes on what you pay or earn, unless a deed or the law says otherwise.</>,
          ]}
        />
      </Clause>

      <Clause n={5} title="Delivery, approval and release">
        <p>
          When the maker marks a part delivered, the client has {review} days to approve it or raise a dispute. Approval releases that
          part’s money at once. If the client does neither, the money is released {hoursInWords(n.holdBufferHours)} after those{" "}
          {review} days end.
        </p>
        <p>
          Released means queued for Razorpay’s next settlement to the maker’s bank, usually within two working days; it does not mean
          the money is in the bank already. Released money is never pulled back. The detail is in{" "}
          <Link to="/legal/delivery">Shipping and delivery</Link>.
        </p>
      </Clause>

      <Clause n={6} title="Refunds and ending a deed early">
        <p>
          If a part isn’t delivered within {daysInWords(n.graceDays)} after its due date, the client may ask for that part’s money
          back. The two of you may also agree on Vaada to end a deed early. What is refunded, how, and how long it takes is set out in{" "}
          <Link to="/legal/refunds">Refunds and cancellations</Link>.
        </p>
      </Clause>

      <Clause n={7} title="Disputes">
        <Items
          items={[
            <>
              Either of you may raise a dispute about a delivered part before its review window closes. The money for that part then
              stays held.
            </>,
            <>
              Vaada reads the deed, its register of what happened, and what each of you sends us, and decides whether to release the
              money to the maker, refund it to the client, or split it. We write to both of you with the decision and our reasons.
            </>,
            <>
              Vaada’s decision settles the money held for that part, and nothing more. It doesn’t stop either of you going to court or
              using any other remedy the law gives you.
            </>,
          ]}
        />
      </Clause>

      <Clause n={8} title="The public registry">
        <p>
          Each step of a deed (sent, accepted, paid, delivered, released, refunded, disputed, decided or cancelled) is recorded on a
          public registry on the Polygon blockchain, so that either of you, or anyone you show the deed to, can check when it happened.
        </p>
        <p>
          An entry holds only a hash of the deed, a random maker id, the kind of step, a scrambled payment reference and the time. It
          holds no names, email addresses, amounts or bank details. Entries on a public blockchain can’t be changed or erased by anyone,
          us included.
        </p>
      </Clause>

      <Clause n={9} title="What we answer for">
        <Items
          items={[
            <>
              We run Vaada with reasonable care and skill, record each step faithfully, and pass your instructions to Razorpay
              promptly.
            </>,
            <>
              We don’t answer for the work itself, for anything one of you owes the other beyond the money held, or for delays and
              failures of Razorpay, banks, UPI or the blockchain that are outside our control.
            </>,
            <>
              Nothing here limits a liability that the law, including the Consumer Protection Act, 2019, does not allow to be limited.
              Otherwise our liability to you on any deed is limited to the fees paid to Vaada on that deed. Money held by Razorpay for
              a deed is never ours, so this limit never reduces what you are owed from it.
            </>,
          ]}
        />
      </Clause>

      <Clause n={10} title="Closing an account">
        <p>
          You may delete your account at any time from the <Link to="/legal/privacy">privacy page</Link>, once no money is held on
          any of your deeds. We may suspend an account that breaks these terms or the law, or that Razorpay will not serve. We will
          tell you why unless the law forbids it, and money already held on a deed will still be released or refunded under that deed.
        </p>
      </Clause>

      <Clause n={11} title="Changes">
        <p>
          We will post any change to these terms here with a new date at the top, and email you before a change that affects you takes
          effect. A deed already accepted keeps the terms it was accepted under.
        </p>
      </Clause>

      <Clause n={12} title="Law and courts">
        <p>
          These terms are governed by the laws of India. Subject to § 7, the courts at <Placeholder>City to be added</Placeholder>{" "}
          have jurisdiction over any dispute about them.
        </p>
      </Clause>
    </PolicySheet>
  );
}
