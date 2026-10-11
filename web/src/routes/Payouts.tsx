import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, ButtonLink, Notice, PageHeader, Waiting } from "../components/ui";
import { api } from "../lib/api";
import { explain } from "../lib/errors";
import { useMe } from "../lib/session";
import type { Payout } from "../lib/types";
import type { PayoutFields } from "../pages/payoutForm";
import { PayoutFormSheet } from "../pages/PayoutFormSheet";
import { PayoutStanding } from "../pages/PayoutStanding";

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6";
const HEADING = "Where should we send your money?";
const TITLE = <title>Payouts · Vaada</title>;

/**
 * Each look asks Razorpay live, and a review can take a day, so an open tab looks often at first and then less and
 * less. Query skips the looks while the tab is hidden; the page looks once more when it is shown again.
 */
function lookAgainAfter(looks: number): number {
  if (looks < 10) return 3_000;
  if (looks < 30) return 15_000;
  return 60_000;
}

const NEEDS_FORM: ReadonlySet<Payout["status"]> = new Set(["draft", "needs_clarification"]);

function MarginNotes({ payout }: { payout: Payout | null }) {
  return (
    <aside aria-label="About payouts" className="border-t hairline pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
      <ul className="m-0 list-none space-y-4 p-0 text-note text-ink-soft">
        <li>Razorpay holds your clients’ money and pays it out, so the law asks it to know whom it pays. Vaada never holds the money.</li>
        <li>You set this up once. Every part of every deal released to you goes to the same account.</li>
        {payout?.status === "activated" ? (
          <li>
            To pay into a different account,{" "}
            <Link to="/legal/contact" className="underline">
              write to us
            </Link>
            ; we change it with Razorpay so nothing goes astray.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}

export default function Payouts() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [timesSaved, setTimesSaved] = useState(0);
  const [lastSent, setLastSent] = useState<PayoutFields | null>(null);
  const query = useQuery({
    queryKey: ["payouts"],
    queryFn: () => api.get<{ payout: Payout | null }>("/payouts"),
    enabled: !!me.data,
    refetchInterval: (q) => (q.state.data?.payout?.status === "under_review" ? lookAgainAfter(q.state.dataUpdateCount) : false),
    refetchOnWindowFocus: (q) => q.state.data?.payout?.status === "under_review",
  });

  useEffect(() => {
    if (timesSaved === 0) return;
    window.scrollTo({ top: 0 });
    document.getElementById("payout-standing")?.focus();
  }, [timesSaved]);

  if (me.isPending) {
    return (
      <>
        {TITLE}
        <Waiting />
      </>
    );
  }
  if (me.isError && !me.data) {
    return (
      <div className={PAGE}>
        {TITLE}
        <PageHeader kicker="Payouts" title={HEADING} />
        <Notice tone="error">{explain(me.error, "We couldn’t check who’s signed in just now.")}</Notice>
        <Button tone="plain" className="mt-4" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!me.data) {
    return (
      <div className={PAGE}>
        {TITLE}
        <PageHeader kicker="Payouts" title={HEADING} lede="Sign in first, so we know whose money this is and where it should go." />
        <ButtonLink to={`/login?next=${encodeURIComponent("/payouts")}`}>Sign in</ButtonLink>
      </div>
    );
  }

  function saved(payout: Payout, sent: PayoutFields) {
    setLastSent(sent);
    queryClient.setQueryData(["payouts"], { payout });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    setTimesSaved((n) => n + 1);
  }

  const payout = query.data?.payout ?? null;
  const showForm = query.isSuccess && (payout === null || NEEDS_FORM.has(payout.status));

  return (
    <div className={PAGE}>
      {TITLE}
      <PageHeader
        kicker="Payouts"
        title={HEADING}
        lede="Razorpay pays you directly, into your own bank account. Tell it which account is yours, once, and everything released to you goes there."
      />
      {query.isPending ? <Waiting>Asking Razorpay.</Waiting> : null}
      {query.isError ? (
        <div>
          <Notice tone="error">{explain(query.error, "We couldn’t find out where your payouts stand. Try again in a moment.")}</Notice>
          <Button tone="plain" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {query.isSuccess ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,46rem)_minmax(0,1fr)] lg:gap-14">
          <div className="space-y-8">
            {payout ? <PayoutStanding payout={payout} /> : null}
            {showForm ? <PayoutFormSheet key={payout?.status ?? "new"} previous={payout} lastSent={lastSent} onSaved={saved} /> : null}
          </div>
          <MarginNotes payout={payout} />
        </div>
      ) : null}
    </div>
  );
}
