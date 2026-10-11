import { useRef, useState } from "react";
import { Button, focusOnMount, Notice } from "../components/ui";
import { formatRupees } from "../format/money";
import { api } from "../lib/api";
import { useConfig } from "../lib/config";
import { explain } from "../lib/errors";
import type { CheckoutOrder, PublicDeed } from "../lib/types";
import { FakeCheckout } from "./FakeCheckout";
import { loadRazorpay, openCheckout, type CheckoutFields } from "./razorpay";
import { dayOf, firstName } from "./words";

interface Props {
  deed: PublicDeed;
  /** The client has just accepted, so the payment step takes focus as it appears. */
  takeFocus: boolean;
  awaitingCapture: boolean;
  onReturned: () => void;
}

/** Opens Razorpay Checkout (or the simulated one in dev and demo) and hands the result to the API. */
export function PayStep({ deed, takeFocus, awaitingCapture, onReturned }: Props) {
  const { data: config } = useConfig();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fakeOrder, setFakeOrder] = useState<CheckoutOrder | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const payButton = useRef<HTMLButtonElement>(null);
  const maker = firstName(deed.maker.name);

  /**
   * Checkout has taken the money by now, and Razorpay's capture webhook is what confirms it, so the page waits
   * for that even when telling the API fails. Offering the Pay button again would invite a second payment.
   */
  async function returnFromCheckout(fields: CheckoutFields) {
    setFakeOrder(null);
    setError(null);
    onReturned();
    try {
      await api.post(`/public/deeds/${deed.slug}/checkout-return`, fields);
    } catch (caught) {
      console.warn("checkout return not recorded; waiting for Razorpay's capture webhook", caught);
      setUnconfirmed(true);
    }
  }

  async function startPayment() {
    setError(null);
    setOpening(true);
    try {
      const order = await api.post<CheckoutOrder>(`/public/deeds/${deed.slug}/order`);
      if (order.gateway === "fake") {
        setFakeOrder(order);
      } else {
        openCheckout(await loadRazorpay(), order.options, {
          onPaid: (fields) => void returnFromCheckout(fields),
          onFailed: (description) =>
            setError(`The last attempt didn’t go through (${description.replace(/\.$/, "")}). Nothing was taken; you can try again.`),
        });
      }
    } catch (caught) {
      setError(explain(caught, "Razorpay Checkout didn’t open. Check your connection and try again. Nothing has been charged."));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 ref={takeFocus ? focusOnMount : undefined} tabIndex={-1} className="font-display text-h3 text-ink focus:outline-none">
        Pay
      </h2>
      <p className="m-0 text-body text-ink">
        {deed.accepted ? `Accepted by ${deed.accepted.name}. ` : null}
        {deed.pay_by ? `Pay by ${dayOf(deed.pay_by)} so ${maker} can begin; after that the deed lapses and nothing is charged.` : null}
      </p>
      {awaitingCapture ? (
        <Notice tone="ok">
          <p ref={focusOnMount} tabIndex={-1} className="m-0 focus:outline-none">
            {unconfirmed
              ? "Razorpay has your payment. We couldn’t confirm it from here, so it may take a few minutes to show. This page updates by itself; there’s no need to pay again."
              : "We have your payment. Razorpay is confirming it now; this page updates by itself."}
          </p>
        </Notice>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <Button ref={payButton} busy={opening} onClick={() => void startPayment()}>
            Pay {formatRupees(deed.fees.order_paise)}
          </Button>
          <p className="m-0 text-note text-ink-soft">
            {config?.gateway === "fake"
              ? "A simulated checkout opens here. No real money moves."
              : `Razorpay Checkout opens over this page. You can pay by ${deed.fees.upi_allowed ? "UPI, netbanking or card" : "netbanking or card"}.`}
          </p>
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {fakeOrder ? (
        <FakeCheckout
          key={fakeOrder.order_id}
          order={fakeOrder}
          upiLimitPaise={config?.limits.upi_limit_paise ?? null}
          returnFocus={payButton}
          onClose={() => setFakeOrder(null)}
          onPaid={(fields) => void returnFromCheckout(fields)}
        />
      ) : null}
    </div>
  );
}
