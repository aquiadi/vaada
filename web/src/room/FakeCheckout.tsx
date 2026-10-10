import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Button, Mono, Notice } from "../components/ui";
import { formatRupees } from "../format/money";
import { ApiError, api } from "../lib/api";
import type { CheckoutOrder } from "../lib/types";
import type { CheckoutFields } from "./razorpay";

type Method = "upi" | "netbanking" | "card";

const METHODS: Array<[Method, string]> = [
  ["upi", "UPI"],
  ["netbanking", "Netbanking"],
  ["card", "Debit or credit card"],
];

interface Props {
  order: CheckoutOrder;
  upiLimitPaise: number | null;
  onClose: () => void;
  onPaid: (fields: CheckoutFields) => Promise<void>;
}

/**
 * Dev and demo stand-in for Razorpay Checkout. It looks deliberately unlike the deed and unlike Razorpay,
 * and says on its face that no money moves.
 */
export function FakeCheckout({ order, upiLimitPaise, onClose, onPaid }: Props) {
  const [method, setMethod] = useState<Method>(order.upi_allowed ? "upi" : "netbanking");
  const [busy, setBusy] = useState<"pay" | "fail" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function attempt(succeed: boolean) {
    setBusy(succeed ? "pay" : "fail");
    setError(null);
    try {
      const fields = await api.post<CheckoutFields>(`/dev/fake-checkout/${order.order_id}`, { method, succeed });
      await onPaid(fields);
    } catch (caught) {
      if (!succeed && caught instanceof ApiError && caught.status === 402) {
        setError("The simulated bank declined the payment. Nothing was taken; you can try again.");
      } else {
        setError(caught instanceof ApiError ? caught.message : "The simulated payment didn't go through. Nothing was taken; try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--ink)_45%,transparent)]" />
        <Dialog.Content
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(27rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border-2 border-dashed border-ink bg-paper-deep p-5 font-ui text-ink focus:outline-none"
        >
          <p className="label m-0">Dev and demo only</p>
          <Dialog.Title className="m-0 mt-1 font-ui text-body font-semibold leading-snug text-ink">
            Simulated checkout. No real money moves.
          </Dialog.Title>
          <Dialog.Description className="m-0 mt-2 text-note text-ink-soft">
            This stands in for Razorpay Checkout so the whole flow can be tried. Pay tells the pretend gateway to capture the payment;
            Make it fail has the pretend bank decline it.
          </Dialog.Description>

          <dl className="m-0 mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-y border-dashed border-ink/40 py-3 text-note">
            <dt className="label pt-[0.15rem]">Amount</dt>
            <dd className="figures m-0 font-semibold">{formatRupees(order.amount_paise)}</dd>
            <dt className="label pt-[0.15rem]">Order</dt>
            <dd className="m-0">
              <Mono>{order.order_id}</Mono>
            </dd>
          </dl>

          <fieldset className="m-0 mt-4 border-0 p-0">
            <legend className="label mb-2 p-0">Pay with</legend>
            <div className="flex flex-col gap-2">
              {METHODS.map(([value, name]) => {
                const blocked = value === "upi" && !order.upi_allowed;
                return (
                  <label
                    key={value}
                    className={`flex min-h-10 items-center gap-3 rounded-sm border px-3 py-2 text-note ${
                      method === value ? "border-ink bg-paper" : "border-ink/25"
                    } ${blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  >
                    <input
                      type="radio"
                      name="fake-checkout-method"
                      value={value}
                      checked={method === value}
                      disabled={blocked}
                      onChange={() => setMethod(value)}
                      className="h-4 w-4 accent-[var(--ink)]"
                    />
                    <span>
                      {name}
                      {blocked ? (
                        <span className="block text-micro text-ink-soft">
                          Not offered for this amount{upiLimitPaise ? `: UPI stops at ${formatRupees(upiLimitPaise)}` : ""}.
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error ? (
            <Notice tone="error" className="mt-4">
              {error}
            </Notice>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Button tone="quiet" disabled={busy !== null}>
                Close
              </Button>
            </Dialog.Close>
            <Button tone="plain" busy={busy === "fail"} disabled={busy !== null} onClick={() => void attempt(false)}>
              Make it fail
            </Button>
            <Button busy={busy === "pay"} disabled={busy !== null} onClick={() => void attempt(true)}>
              Pay {formatRupees(order.amount_paise)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
