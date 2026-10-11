import type { ReactNode } from "react";
import { Link } from "react-router";
import { LegalEntity } from "./OwnerDetails";
import { Clause, Items, PolicySheet } from "./PolicySheet";
import { YourData } from "./YourData";

interface Holding {
  name: string;
  what: ReactNode;
  why: ReactNode;
  kept: ReactNode;
}

const LAW_REQUIRES = "as long as tax and payment laws require, typically eight years (pending legal review)";

const HOLDINGS: Holding[] = [
  {
    name: "Your account",
    what: "Your email address, your phone number if you sign in with one, your display name and your public handle.",
    why: "To sign you in, to write to you about your deeds, and to show who wrote or accepted a deed.",
    kept: "Until you delete your account.",
  },
  {
    name: "Deeds",
    what: "The deeds you write, send or accept: the parties’ names, the work, its parts, dates and amounts, and the register of each step.",
    why: "They are the agreement, and both parties are entitled to their copy.",
    kept: `With the payment records they belong to, for ${LAW_REQUIRES}. Unsent drafts go when you delete your account.`,
  },
  {
    name: "Acceptances",
    what: "When a client accepts a deed: the name they typed, their email address, the time, their IP address and their browser.",
    why: "Evidence that the contract was made, should either party ever need to show it.",
    kept: "As long as the deed itself. They are not removed when an account is deleted.",
  },
  {
    name: "Letters we send you",
    what: "A copy of each email we send you: the address it went to, its subject and its text.",
    why: "To send it again if delivery fails, and to show what you were told and when.",
    kept: "Until you delete your account.",
  },
  {
    name: "Dictations and updates",
    what: "The text of what you dictate into a deed’s blanks, and the updates you dictate in a deal room.",
    why: (
      <>
        To fill the blanks, propose changes, and show you what was heard. Vaada never receives your voice: Wispr Flow turns speech into
        text on your device, under its own privacy policy, and we receive only that text.
      </>
    ),
    kept: "Dictations until you delete your account. Updates on a deed stay with the deed.",
  },
  {
    name: "Payout details, for makers",
    what: "Your legal name, business type, the last four digits of your bank account and its IFSC. Your PAN, full account number and address pass straight to Razorpay; Vaada doesn’t keep them.",
    why: "So that Razorpay can pay you, and so you can see where your money goes.",
    kept: `With the payment records, for ${LAW_REQUIRES}.`,
  },
  {
    name: "Payment records",
    what: "The ledger: amounts, fees, Razorpay’s ids for each order, payment, transfer and refund, and when each happened. Card, UPI and bank login details are handled by Razorpay alone; we never see them.",
    why: "To account for every paisa, and because tax and payment laws require it.",
    kept: `For ${LAW_REQUIRES}.`,
  },
  {
    name: "Technical records",
    what: "IP addresses on requests, and error reports.",
    why: "To keep Vaada secure, to stop abuse such as repeated sign-in attempts, and to fix faults. Error reports are sent without personal data.",
    kept: "No more than 90 days, unless needed to look into a specific incident (pending legal review).",
  },
];

function HoldingsSchedule() {
  return (
    <dl>
      {HOLDINGS.map((holding) => (
        <div key={holding.name} className="grid gap-x-6 gap-y-1 border-t hairline py-4 first:border-t-0 first:pt-0 md:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="font-semibold text-ink">{holding.name}</dt>
          <dd className="space-y-2">
            <p>{holding.what}</p>
            <p className="text-note text-ink-soft">
              <span className="label mr-2 text-ink">Why</span>
              {holding.why}
            </p>
            <p className="text-note text-ink-soft">
              <span className="label mr-2 text-ink">Kept</span>
              {holding.kept}
            </p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PrivacyPolicy() {
  return (
    <PolicySheet slug="privacy" lede="What we collect, why we need it, how long we keep it, and how to take it with you or have it deleted.">
      <Clause n={1} title="Who is responsible">
        <p>
          <LegalEntity />, which operates Vaada, is the data fiduciary for the personal data
          described here, under the Digital Personal Data Protection Act, 2023. Questions and complaints about your data go to our
          grievance officer, whose details are on the <Link to="/legal/contact">contact page</Link>.
        </p>
        <p>
          We collect only what running a deed needs. We don’t sell or rent personal data, show advertising, or use tracking cookies.
          Your browser keeps your sign-in session and your choice of light or dark paper, and nothing else of ours.
        </p>
      </Clause>

      <Clause n={2} title="What we hold, why, and for how long">
        <HoldingsSchedule />
      </Clause>

      <Clause n={3} title="Who else handles it">
        <p>These services handle personal data for us, each only to provide its service:</p>
        <Items
          items={[
            <>Supabase, for sign-in and our database.</>,
            <>
              Razorpay, for payments, holding the money, payouts, and the checks it runs on makers. The PAN and bank details you give
              Razorpay are held by it under its own privacy policy.
            </>,
            <>Resend, for sending our emails.</>,
            <>Sentry, for error reports, which are sent without personal data.</>,
            <>Polygon, a public blockchain, for the registry, which receives hashes and random ids only (§ 5).</>,
          ]}
        />
        <p>
          Some of these services may process data outside India. Where they do, we rely on their contractual safeguards and only on
          transfers the law permits (pending legal review). We share personal data with authorities only when the law requires it.
        </p>
      </Clause>

      <Clause n={4} title="Your rights">
        <p>Under the Digital Personal Data Protection Act, 2023 you may:</p>
        <Items
          items={[
            <>
              have a summary of the personal data we hold and what we do with it: this page is that summary, and{" "}
              <a href="#your-data">your data</a> below lets you download all of it;
            </>,
            <>have it corrected or completed, by changing it in your account or writing to us;</>,
            <>
              have it erased, by <a href="#your-data">deleting your account</a>, within the limits in § 6;
            </>,
            <>withdraw a consent you gave, without undoing what was lawfully done before;</>,
            <>nominate someone to exercise these rights for you if you die or become unable to, by writing to us;</>,
            <>
              complain to our grievance officer, and if you are not satisfied with the answer, to the Data Protection Board of India.
            </>,
          ]}
        />
      </Clause>

      <Clause n={5} title="The public registry">
        <p>
          Each step of a deed is recorded on Polygon, a public blockchain. An entry holds a hash of the deed (a fingerprint that proves
          the text hasn’t changed without revealing what it says), a random maker id, the kind of step, a scrambled payment reference
          and the time. It contains no names, email addresses, phone numbers, amounts or bank details.
        </p>
        <p>
          Entries on a public blockchain can’t be changed or erased by anyone, us included. When you delete your account your maker id
          is unlinked from you, so those entries can no longer be tied to you through Vaada.
        </p>
      </Clause>

      <Clause n={6} title="Deleting your account">
        <p>
          You can delete your account yourself, below, once no money is held on any of your deeds. If money is still held, we will say
          so; once it is released or refunded, you can delete. Deleting your account:
        </p>
        <Items
          items={[
            <>removes your email address, phone number, display name and handle from your account, and marks it deleted;</>,
            <>deletes your sign-in record, which holds your email address too;</>,
            <>
              removes the letters we sent you, with the address they went to, their subject and their text, and stops any not yet
              sent;
            </>,
            <>unlinks your maker id, so registry entries can no longer be tied to you;</>,
            <>deletes the drafts you never sent and the text of your dictations;</>,
            <>removes the name on your payout account.</>,
          ]}
        />
        <p>What stays, and why:</p>
        <Items
          items={[
            <>
              deeds you sent or accepted, exactly as written, names included, with the email address each was sent to, because the
              other party is entitled to their copy;
            </>,
            <>acceptances, with the typed name, email address, time and IP address, as evidence that a contract was made;</>,
            <>
              the ledger and payment records, for {LAW_REQUIRES}, attached to an account that no longer says whose it was;
            </>,
            <>Razorpay’s own records, which it keeps under its own policy; ask Razorpay about those directly.</>,
          ]}
        />
      </Clause>

      <Clause n={7} title="Keeping it safe">
        <p>
          Data travels encrypted and is stored with Supabase, and only the people who run Vaada can reach it. If a breach affects your
          personal data, we will tell you and the Data Protection Board of India as the law requires.
        </p>
      </Clause>

      <Clause n={8} title="Children">
        <p>
          Vaada is for adults. We don’t knowingly hold personal data about anyone under eighteen; if you think we do, write to us and we
          will delete it.
        </p>
      </Clause>

      <Clause n={9} title="Your data" id="your-data">
        <YourData />
      </Clause>
    </PolicySheet>
  );
}
