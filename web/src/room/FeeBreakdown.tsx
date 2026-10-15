import { Rupees } from "../components/ui";
import { numberWord } from "../deed/blanks";
import { formatRupees, rupeesInWords } from "../format/money";
import { useConfig } from "../lib/config";
import type { PublicDeed } from "../lib/types";

interface Props {
  fees: PublicDeed["fees"];
  maker: string;
  graceDays: number | null;
}

/** The sum, set out before anyone accepts: the deal, the fee on its own line, and what leaves the client's account. */
export function FeeBreakdown({ fees, maker, graceDays }: Props) {
  const { data: config } = useConfig();
  const upiLimit = config?.limits.upi_limit_paise;
  return (
    <div>
      <h2 id="fees-heading" className="font-display text-h3 text-ink">
        What you’ll pay
      </h2>
      <table className="mt-3 w-full border-collapse text-body">
        <caption className="sr-only">The deal total, the processing fee, and the amount you pay</caption>
        <tbody>
          <tr className="border-b hairline">
            <th scope="row" className="py-2 pr-4 text-left align-top font-normal text-ink">
              Deal total
              <span className="block text-note text-ink-soft">For the work. Razorpay holds it and pays it to {maker} one part at a time.</span>
            </th>
            <td className="py-2 text-right align-top">
              <Rupees paise={fees.total_paise} />
            </td>
          </tr>
          {fees.client_fee_paise > 0 ? (
            <tr>
              <th scope="row" className="py-2 pr-4 text-left align-top font-normal text-ink">
                Processing fee
                <span className="block text-note text-ink-soft">Covers Razorpay’s charges. Not refundable.</span>
              </th>
              <td className="py-2 text-right align-top">
                <Rupees paise={fees.client_fee_paise} />
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-b-[3px] border-t border-double border-ink">
            <th scope="row" className="py-2 pr-4 text-left font-semibold text-ink">
              You pay
            </th>
            <td className="py-2 text-right">
              <Rupees paise={fees.order_paise} className="font-semibold" />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="m-0 mt-2 text-note italic text-ink-soft">{rupeesInWords(fees.order_paise)}</p>
      {fees.client_fee_paise > 0 ? null : (
        <p className="m-0 mt-2 text-note text-ink">Razorpay may add its own charge when you pay; it isn’t refunded.</p>
      )}
      {fees.upi_allowed ? null : (
        <p className="m-0 mt-3 text-note text-ink">
          UPI isn’t offered for this payment, because UPI caps most payments at {upiLimit ? formatRupees(upiLimit) : "a lakh of rupees"}. Netbanking
          and cards work.
        </p>
      )}
      {graceDays !== null ? (
        <p className="m-0 mt-3 text-note text-ink-soft">
          If a part isn’t delivered within {numberWord(graceDays)} days after its due date, you can ask for that part’s money back. The processing fee isn’t refunded.
        </p>
      ) : null}
    </div>
  );
}
