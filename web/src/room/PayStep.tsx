import { useState } from "react";
import { Button, Notice } from "../components/ui";
import { formatRupees } from "../format/money";
import { ApiError, api } from "../lib/api";
import { useConfig } from "../lib/config";
import type { CheckoutOrder, PublicDeed } from "../lib/types";
import { FakeCheckout } from "./FakeCheckout";
import { loadRazorpay, openCheckout, type CheckoutFields } from "./razorpay";
import { dayOf, firstName } from "./words";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

function explain(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  console.warn("payment step failed", error);
  return fallback;
}

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
  const maker = firstName(deed.maker.name);

  async function returnFromCheckout(fields: CheckoutFields) {
    await api.post(`/public/deeds/${deed.slug}/checkout-return`, fields);
    setFakeOrder(null);
    onReturned();
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
          onPaid: (fields) => {
            returnFromCheckout(fields).catch((caught: unknown) =>
              setError(explain(caught, "Razorpay took the payment, but we couldn’t confirm it from here. It will show on this page within a few minutes.")),
            );
          },
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
            We have your payment. Razorpay is confirming it now; this page updates by itself.
          </p>
        </Notice>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <Button busy={opening} onClick={() => void startPayment()}>
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
          onClose={() => setFakeOrder(null)}
          onPaid={returnFromCheckout}
        />
      ) : null}
    </div>
  );
}
