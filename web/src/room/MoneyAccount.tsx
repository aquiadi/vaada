import { Rupees } from "../components/ui";
import { formatInstantIst } from "../format/dates";
import type { Room } from "../lib/types";
import { firstName, moneyStanding } from "./words";

const METHOD_NAMES: Record<string, string> = { upi: "UPI", netbanking: "netbanking", card: "card" };

function Row({ label, note, paise, total = false }: { label: string; note?: string; paise: number; total?: boolean }) {
  return (
    <tr className={total ? "border-y border-ink" : "border-b hairline"}>
      <th scope="row" className={`py-2 pr-4 text-left align-top text-ink ${total ? "font-semibold" : "font-normal"}`}>
        {label}
        {note ? <span className="block text-note font-normal text-ink-soft">{note}</span> : null}
      </th>
      <td className="py-2 text-right align-top">
        <Rupees paise={paise} className={total ? "font-semibold" : ""} />
      </td>
    </tr>
  );
}

/** The money on the deed, the way an account book would set it out: what was owed, what was paid, where it is now. */
export function MoneyAccount({ room }: { room: Room }) {
  const standing = moneyStanding(room);
  const payer = room.role === "client" ? "you" : firstName(room.client.name);
  const payment = room.payment?.status === "captured" ? room.payment : null;
  const awaitingPayment = room.status === "published" || room.status === "accepted";
  const paidNote = payment?.captured_at
    ? `On ${formatInstantIst(payment.captured_at)}${payment.method ? `, by ${METHOD_NAMES[payment.method] ?? payment.method}` : ""}.`
    : undefined;
  const releaseNote = room.role === "maker" && room.bank_last4 ? `To your bank account ending ${room.bank_last4}.` : undefined;
  const anyStanding = standing.heldPaise + standing.releasedPaise + standing.refundedPaise + standing.unpaidPaise > 0;

  return (
    <section id="money" aria-labelledby="money-heading" className="mt-12 scroll-mt-6">
      <h2 id="money-heading" className="font-display text-h3 text-ink">
        The money
      </h2>
      <table className="mt-4 w-full border-collapse text-body">
        <caption className="sr-only">What this deed costs, what was paid, and where the deal total stands now</caption>
        <tbody>
          <Row label="Deal total" note="For the work, as written in the deed." paise={room.money.total_paise ?? 0} />
          <Row
            label="Processing fee"
            note={`Paid by ${payer} on top of the deal total. It covers Razorpay’s charges and isn’t refunded.`}
            paise={room.money.client_fee_paise}
          />
          {room.money.platform_fee_paise > 0 ? (
            <Row label="Vaada’s fee" note="Taken from the Maker’s share as each part is released." paise={room.money.platform_fee_paise} />
          ) : null}
          {payment ? <Row label="Paid through Razorpay" note={paidNote} paise={room.money.order_paise} total /> : null}
          {!payment && awaitingPayment ? <Row label="To be paid through Razorpay" paise={room.money.order_paise} total /> : null}
        </tbody>
        {anyStanding ? (
          <tbody>
            <tr>
              <th colSpan={2} scope="colgroup" className="label pb-1 pt-6 text-left font-medium">
                Where the deal total stands
              </th>
            </tr>
            {standing.heldPaise > 0 ? <Row label="Held by Razorpay" paise={standing.heldPaise} /> : null}
            {standing.releasedPaise > 0 ? <Row label="Released for the next settlement" note={releaseNote} paise={standing.releasedPaise} /> : null}
            {standing.refundedPaise > 0 ? <Row label={`Refunded to ${payer}`} paise={standing.refundedPaise} /> : null}
            {standing.unpaidPaise > 0 ? <Row label="Not yet paid" paise={standing.unpaidPaise} /> : null}
          </tbody>
        ) : null}
      </table>
    </section>
  );
}
