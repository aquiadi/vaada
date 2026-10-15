import type { ReactNode } from "react";
import { Wordmark } from "../app/Shell";
import { ButtonLink, DoubleRule } from "../components/ui";
import { numberWord } from "../deed/blanks";
import { hoursInWords, percentFromBps } from "../legal/policyNumbers";
import { type AppConfig, useConfig } from "../lib/config";
import { flowHint } from "../lib/platform";
import { DeedPlate } from "../pages/DeedPlate";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-b hairline py-4 last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)]">
      <span aria-hidden="true" className="figures pt-0.5 text-right font-display text-h3 leading-none text-ink-soft">
        {n}
      </span>
      <div>
        <h3 className="m-0 font-serif text-body font-semibold text-ink">{title}</h3>
        <p className="m-0 mt-1 text-body text-ink">{children}</p>
      </div>
    </li>
  );
}

function Paying({ config }: { config: AppConfig | undefined }) {
  if (!config) return <>Or by netbanking or card, through Razorpay. Your client sees the whole sum before paying.</>;
  if (config.fees.client_fee_bps === 0) {
    return (
      <>
        Or by netbanking or card, through Razorpay. Your client sees the whole sum before paying. Razorpay may add its own charge at
        checkout; it isn’t refunded.
      </>
    );
  }
  return (
    <>
      Or by netbanking or card, through Razorpay. A processing fee of{" "}
      <span className="figures">{percentFromBps(config.fees.client_fee_bps)}</span> for Razorpay’s charges is added as its own line,
      so your client sees the whole sum before paying.
    </>
  );
}

/** Silence releases a part only once the review has ended and the hold buffer after it has passed, as the API schedules it. */
function silentRelease(config: AppConfig | undefined): string {
  if (!config) return "a little after the review days end";
  const { review_window_days: days, hold_buffer_hours: buffer } = config.limits;
  return `${hoursInWords(buffer)} after the ${numberWord(days)}-day review ends`;
}

function MoneySteps({ config }: { config: AppConfig | undefined }) {
  return (
    <ol className="m-0 list-none p-0">
      <Step n={1} title="You agree.">
        You fill in the blanks of a deed: the work, the dates, the fee. Your client reads it and accepts it as written. After that, neither
        of you can change it alone.
      </Step>
      <Step n={2} title="They pay by UPI.">
        <Paying config={config} />
      </Step>
      <Step n={3} title="Razorpay holds it.">
        The money sits with Razorpay, not with Vaada and not yet with you. You can both see that it is there before the work begins.
      </Step>
      <Step n={4} title="It is released part by part.">
        Each part is released when your client approves the work, or, if they say nothing, {silentRelease(config)}. Released means it
        joins Razorpay’s next settlement to your bank; it isn’t in your account that minute.
      </Step>
    </ol>
  );
}

export default function Home() {
  const { data: config } = useConfig();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <title>Deeds for freelance work · Vaada</title>
      <section aria-labelledby="home-title" className="flex flex-col items-center pt-12 pb-12 text-center sm:pt-20 sm:pb-16">
        <p className="label m-0 mb-4">Deeds for freelance work</p>
        <h1 id="home-title" className="m-0">
          <Wordmark size="lg" />
        </h1>
        <hr className="rule-double mt-6 w-24" />
        <p className="measure mx-auto mt-6 mb-0 text-lede text-ink">
          Set down the work, the dates and the fee as a proper deed; your client accepts it and pays, Razorpay holds the money, and it comes
          to you one part at a time.
        </p>
        <ButtonLink to="/new" className="mt-8">
          Draw up a deed
        </ButtonLink>
        <p className="measure mx-auto mt-4 mb-0 text-note italic text-ink-soft">
          Wispr Flow lets you dictate into the blanks. {flowHint()}; typing works just as well.
        </p>
      </section>

      <div className="mx-auto max-w-[30rem]">
        <DeedPlate />
      </div>

      <section aria-labelledby="money-heading" className="measure mx-auto mt-16 sm:mt-20">
        <DoubleRule className="mb-8" />
        <h2 id="money-heading" className="m-0 mb-2 font-display text-h2 text-ink">
          How the money works
        </h2>
        <p className="m-0 mb-4 text-body text-ink-soft">In plain words, from the day you agree to the day it settles.</p>
        <MoneySteps config={config} />
      </section>
    </div>
  );
}
