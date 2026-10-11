import type { ReactNode } from "react";
import { Link } from "react-router";
import { Rupees } from "../components/ui";
import { processingFeePaise, rupeesInWords } from "../format/money";
import { percentFromBps, type PolicyNumbers, usePolicyNumbers } from "./policyNumbers";
import { Clause, Items, PolicySheet } from "./PolicySheet";

const EXAMPLE_TOTAL_PAISE = 25_000_00;

interface Line {
  label: ReactNode;
  paise: number;
}

function Account({ caption, lines, total }: { caption: string; lines: Line[]; total: Line }) {
  return (
    <table className="w-full border-collapse text-body">
      <caption className="label pb-2 text-left">{caption}</caption>
      <tbody>
        {lines.map((line, i) => (
          <tr key={i} className="border-b hairline">
            <th scope="row" className="py-2 pr-4 text-left align-top font-normal text-ink">
              {line.label}
            </th>
            <td className="py-2 text-right align-top">
              <Rupees paise={line.paise} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-b-[3px] border-double border-ink">
          <th scope="row" className="py-2 pr-4 text-left font-semibold text-ink">
            {total.label}
          </th>
          <td className="py-2 text-right">
            <Rupees paise={total.paise} className="font-semibold" />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

const GATEWAY_CHARGE = "Razorpay may add its own charge at checkout; it isn’t refunded.";

function lede(n: PolicyNumbers): string {
  const clients =
    n.clientFeeBps === 0
      ? "Clients pay the deal total, and Razorpay may add its own charge at checkout."
      : "Clients pay a small processing fee on top of the deal.";
  const makers = n.platformFeeBps === 0 ? "Makers pay Vaada nothing at present." : "Vaada keeps a small share of each part it pays out.";
  return `${clients} ${makers}`;
}

function ForClients({ clientFeeBps }: { clientFeeBps: number }) {
  if (clientFeeBps === 0) {
    return (
      <p>
        The client pays the deal total, once, at the start. Vaada adds no processing fee. {GATEWAY_CHARGE}
      </p>
    );
  }
  return (
    <p>
      The client pays the deal total, plus a processing fee of <span className="figures">{percentFromBps(clientFeeBps)}</span> of the
      deal total, rounded up to the paisa. The fee covers the payment gateway’s charges and is not refundable. It is shown on its own
      line before you pay, and the whole sum is paid once, at the start.
    </p>
  );
}

export function Pricing() {
  const n = usePolicyNumbers();
  const fee = processingFeePaise(EXAMPLE_TOTAL_PAISE, n.clientFeeBps);
  const platformFee = Math.floor((EXAMPLE_TOTAL_PAISE * n.platformFeeBps) / 10_000);
  const clientPays = EXAMPLE_TOTAL_PAISE + fee;
  const makerReceives = EXAMPLE_TOTAL_PAISE - platformFee;
  const dealTotal: Line = { label: "Deal total", paise: EXAMPLE_TOTAL_PAISE };
  const feeLine: Line = {
    label: (
      <>
        Processing fee, <span className="figures">{percentFromBps(n.clientFeeBps)}</span>
      </>
    ),
    paise: fee,
  };
  return (
    <PolicySheet slug="pricing" lede={lede(n)}>
      <Clause n={1} title="For clients">
        <ForClients clientFeeBps={n.clientFeeBps} />
      </Clause>

      <Clause n={2} title="For makers">
        {n.platformFeeBps === 0 ? (
          <p>
            Vaada charges makers nothing at present: the whole deal total is paid to you, one part at a time, as each is released. If
            that changes, we will say so here and email you before it applies, and it will never apply to a deed already sent.
          </p>
        ) : (
          <p>
            Vaada keeps <span className="figures">{percentFromBps(n.platformFeeBps)}</span> of the deal total, taken from each part as
            it is released, and the rest is paid to you.
          </p>
        )}
      </Clause>

      <Clause n={3} title="A worked example">
        <p>
          A deal of <Rupees paise={EXAMPLE_TOTAL_PAISE} />, from both sides.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <Account
              caption="What the client pays"
              lines={fee > 0 ? [dealTotal, feeLine] : [dealTotal]}
              total={{ label: "Client pays", paise: clientPays }}
            />
            <p className="mt-2 text-note italic text-ink-soft">{rupeesInWords(clientPays)}</p>
            {fee > 0 ? null : <p className="mt-2 text-note text-ink">{GATEWAY_CHARGE}</p>}
          </div>
          <div>
            <Account
              caption="What the maker receives"
              lines={[dealTotal, { label: "Vaada’s fee", paise: platformFee }]}
              total={{ label: "Maker receives", paise: makerReceives }}
            />
            <p className="mt-2 text-note italic text-ink-soft">Over the parts of the deed, as each is released.</p>
          </div>
        </div>
      </Clause>

      <Clause n={4} title="Ways to pay">
        <Items
          items={[
            <>
              UPI, for amounts up to <Rupees paise={n.upiLimitPaise} />.
            </>,
            <>Netbanking.</>,
            <>Debit and credit cards issued in India on Visa, Mastercard or RuPay.</>,
          ]}
        />
        <p>EMI, wallets, international cards, American Express and Diners Club aren’t accepted.</p>
      </Clause>

      <Clause n={5} title="Nothing else">
        <p>
          There is no subscription and no sign-up fee, and nothing to pay for writing a deed or for a deed that is never accepted. All
          amounts are in Indian rupees. If a refund is due, <Link to="/legal/refunds">Refunds and cancellations</Link> sets out what
          comes back.
        </p>
      </Clause>
    </PolicySheet>
  );
}
