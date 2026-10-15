import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatInstantIst } from "../format/dates";
import type { Payout } from "../lib/types";
import { requirementText } from "./payoutForm";

function Explanation({ payout }: { payout: Payout }) {
  switch (payout.status) {
    case "draft":
      return (
        <p className="m-0">
          Your details didn’t all reach Razorpay last time. Fill in the form again; Razorpay carries on from where it stopped, so nothing is
          set up twice.
        </p>
      );
    case "under_review":
      return (
        <>
          <p className="m-0">Razorpay is checking your bank account. This usually takes a few minutes; in testing it can take a day.</p>
          <p className="m-0 mt-2 text-note text-ink-soft">
            This page keeps looking while it is open, less often as time goes on. You can leave it and come back.
          </p>
        </>
      );
    case "needs_clarification":
      return (
        <>
          <p className="m-0">Razorpay couldn’t confirm everything. It says:</p>
          <ul className="m-0 mt-2 list-none space-y-1 border-l-2 border-gold pl-3">
            {payout.requirements.length > 0 ? (
              payout.requirements.map((requirement, i) => (
                <li key={`${requirement.field_reference ?? "r"}-${i}`}>{requirementText(requirement)}</li>
              ))
            ) : (
              <li>Some of the details need to be checked again.</li>
            )}
          </ul>
          <p className="m-0 mt-3">Correct the details below and send them again.</p>
        </>
      );
    case "activated":
      return (
        <>
          <p className="m-0">
            Ready. Money released to you goes to the account ending <span className="figures">{payout.bank_last4 ?? "····"}</span>.
          </p>
          <p className="m-0 mt-2 text-note text-ink-soft">
            Released money joins Razorpay’s next settlement to this account; it isn’t in your bank the minute it is released.
          </p>
        </>
      );
    case "suspended":
      return (
        <p className="m-0">
          Razorpay has suspended payouts to this account, so nothing can be released to you for now. Money your clients have paid stays held
          by Razorpay.{" "}
          <Link to="/legal/contact" className="underline">
            Write to us
          </Link>{" "}
          and we’ll take it up with Razorpay.
        </p>
      );
    case "rejected":
      return (
        <p className="m-0">
          Razorpay didn’t accept this account.{" "}
          <Link to="/legal/contact" className="underline">
            Write to us
          </Link>
          ; we’ll find out why and tell you what can be done.
        </p>
      );
  }
}

function Entry({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 border-b hairline py-2 last:border-b-0">
      <dt className="label self-baseline">{term}</dt>
      <dd className="m-0 self-baseline text-body text-ink">{children}</dd>
    </div>
  );
}

/** What Razorpay last said about the account, and the little Vaada keeps on file. */
export function PayoutStanding({ payout }: { payout: Payout }) {
  const onFile = payout.legal_name || payout.bank_last4 || payout.ifsc;
  return (
    <section aria-labelledby="payout-standing" className="sheet grain rounded-sm px-5 py-7 sm:px-10 sm:py-9">
      <h2 id="payout-standing" tabIndex={-1} className="label m-0 focus:outline-none">
        Status, as Razorpay reports it
      </h2>
      <div role="status" className="mt-3">
        <div className="measure text-body text-ink">
          <Explanation payout={payout} />
        </div>
      </div>
      {onFile ? (
        <>
          <h3 className="label m-0 mt-8">On file with Vaada</h3>
          <dl className="m-0 mt-2">
            {payout.legal_name ? <Entry term="Legal name">{payout.legal_name}</Entry> : null}
            {payout.business_type ? (
              <Entry term="Business type">{payout.business_type === "proprietorship" ? "Sole proprietorship" : "Individual"}</Entry>
            ) : null}
            {payout.bank_last4 ? (
              <Entry term="Account">
                ending <span className="figures">{payout.bank_last4}</span>
              </Entry>
            ) : null}
            {payout.ifsc ? (
              <Entry term="IFSC">
                <span className="figures tracking-[0.06em]">{payout.ifsc}</span>
              </Entry>
            ) : null}
            {payout.activated_at ? <Entry term="Ready since">{formatInstantIst(payout.activated_at)}</Entry> : null}
          </dl>
        </>
      ) : null}
    </section>
  );
}
