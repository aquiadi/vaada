import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, ButtonLink, Notice, PageHeader, Waiting } from "../components/ui";
import { PublishedDeed } from "../deed/PublishedDeed";
import { deedNumber } from "../design/DeedSheet";
import { Seal } from "../design/Seal";
import { formatRupees } from "../format/money";
import { ApiError, api } from "../lib/api";
import { useConfig } from "../lib/config";
import { useMe } from "../lib/session";
import type { PublicDeed } from "../lib/types";
import { Clickwrap } from "../room/Clickwrap";
import { FeeBreakdown } from "../room/FeeBreakdown";
import { PayStep } from "../room/PayStep";
import { dayOf, firstName } from "../room/words";

const PAGE = "mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10";
const SLIP = "sheet grain mx-auto mt-10 max-w-2xl scroll-mt-6 rounded-sm p-5 sm:p-8";

type Stage = "closed" | "paid" | "maker" | "accept" | "pay" | "taken";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

function closedReason(deed: PublicDeed, now: number | null): string | null {
  const reissue = `Ask ${deed.maker.name} to re-issue it with new dates.`;
  if (deed.status === "cancelled") {
    return deed.paid
      ? "This deed was cancelled after it was paid. The deal room shows where each part of the money went."
      : "This deed was cancelled, so it can no longer be accepted or paid. Nothing was charged.";
  }
  if (deed.status === "lapsed") return `This deed lapsed: its first date passed before it was accepted and paid, so nothing was charged. ${reissue}`;
  if (now === null) return null;
  if (deed.status === "published" && deed.accept_until && now > Date.parse(deed.accept_until)) {
    const day = deed.accept_until_day ? `, ${deed.accept_until_day},` : "";
    return `This deed’s first date${day} has passed, so it can no longer be accepted. ${reissue}`;
  }
  if (deed.status === "accepted" && !deed.paid && deed.pay_by && now > Date.parse(deed.pay_by)) {
    return `The time to pay this deed ended on ${dayOf(deed.pay_by)}, so it can no longer be paid. Nothing was charged. ${reissue}`;
  }
  return null;
}

function stageOf(deed: PublicDeed, closed: string | null): Stage {
  if (closed) return "closed";
  if (deed.paid) return "paid";
  if (deed.viewer_role === "maker") return "maker";
  if (deed.status === "published") return "accept";
  if (deed.status === "accepted" && deed.viewer_role === "client") return "pay";
  return "taken";
}

function lede(deed: PublicDeed, stage: Stage, closed: string | null): string {
  const maker = firstName(deed.maker.name);
  switch (stage) {
    case "closed":
      return closed ?? "";
    case "paid":
      return deed.status === "completed"
        ? "Paid and completed. Every part of this deed has been settled."
        : `Paid. Razorpay holds the money and releases it to ${maker} one part at a time.`;
    case "maker":
      return `This is your deed, as ${deed.client.name} sees it.`;
    case "accept":
      return `${deed.maker.name} has written down what you agreed. Read it through; if it’s right, accept it and pay at the foot of the page. Razorpay holds the money until the work is delivered.`;
    case "pay":
      return "You’ve accepted this deed. Pay at the foot of the page so the work can begin.";
    case "taken":
      return "This deed has been accepted.";
  }
}

function Receipt({ deed, stamped }: { deed: PublicDeed; stamped: boolean }) {
  const completed = deed.status === "completed";
  return (
    <section aria-labelledby="receipt-heading" className={SLIP}>
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-left">
        <Seal hash={deed.agreement_hash} caption="Funded" size={148} animate={stamped} />
        <div className="min-w-0">
          <h2 id="receipt-heading" ref={stamped ? focusOnMount : undefined} tabIndex={-1} className="font-display text-h3 text-ink focus:outline-none">
            {completed ? "Paid and completed" : "Paid, and held by Razorpay"}
          </h2>
          <p className="m-0 mt-2 text-body text-ink">
            {completed
              ? "Every part of this deed has been settled. The deal room keeps the full register."
              : `Razorpay holds ${formatRupees(deed.fees.total_paise)} and releases it to ${firstName(deed.maker.name)} one part at a time, as each is delivered and approved.`}
          </p>
          {deed.deal_id ? (
            <ButtonLink to={`/d/${deed.deal_id}`} className="mt-4">
              Open the deal room
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MakerNote({ deed }: { deed: PublicDeed }) {
  const client = deed.client.name;
  return (
    <section aria-labelledby="maker-heading" className={SLIP}>
      <h2 id="maker-heading" className="font-display text-h3 text-ink">
        This is your deed
      </h2>
      <p className="m-0 mt-2 text-body text-ink">
        {deed.status === "published"
          ? `${client} sees the amount and the acceptance form here. Once they accept and pay, the deal room fills in.`
          : `${client} has accepted it and pays from this page. The deal room shows the payment once Razorpay confirms it.`}
      </p>
      {deed.deal_id ? (
        <ButtonLink to={`/d/${deed.deal_id}`} tone="plain" className="mt-4">
          Open the deal room
        </ButtonLink>
      ) : null}
    </section>
  );
}

export default function ClientDeed() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const me = useMe();
  const [justAccepted, setJustAccepted] = useState(false);
  const [awaitingCapture, setAwaitingCapture] = useState(false);
  const [stampedHere, setStampedHere] = useState(false);
  const queryKey = ["public-deed", slug];
  const query = useQuery({
    queryKey,
    queryFn: () => api.get<PublicDeed>(`/public/deeds/${slug}`),
    refetchInterval: (q) => {
      const deed = q.state.data;
      if (!deed) return false;
      if (awaitingCapture && !deed.paid) return 2000;
      return deed.registry_pending ? 4000 : false;
    },
  });
  if (awaitingCapture && query.data?.paid) {
    setAwaitingCapture(false);
    setStampedHere(true);
  }

  if (query.isPending) return <Waiting>Opening the deed.</Waiting>;
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className={PAGE}>
        {missing ? (
          <PageHeader
            kicker="A deed"
            title="This deed isn’t here"
            lede="The link may be mistyped, or the deed hasn’t been sent yet. Check the link in the email you were sent, or ask the person who sent it."
          />
        ) : (
          <>
            <Notice tone="error">{query.error instanceof ApiError ? query.error.message : "We couldn’t open this deed. Try again in a moment."}</Notice>
            <Button tone="plain" className="mt-4" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </>
        )}
      </div>
    );
  }

  const deed = query.data;
  const closed = closedReason(deed, config ? Date.parse(config.now) : null);
  const stage = stageOf(deed, closed);
  const settling = stage === "accept" || stage === "pay";

  return (
    <div className={PAGE}>
      <header className="mb-8">
        <p className="label m-0 mb-2">
          Deed No. <span className="figures">{deedNumber(deed.deed_no)}</span> · From {deed.maker.name}
        </p>
        <h1 className="font-display text-h3 leading-tight text-ink sm:text-h2">{deed.title}</h1>
        <p className="measure m-0 mt-3 text-lede text-ink-soft">{lede(deed, stage, closed)}</p>
        {settling ? (
          <p className="no-print m-0 mt-4">
            <a href="#settle" className="smallcaps text-ui text-ink">
              {stage === "accept" ? "Skip to the amount and acceptance" : "Skip to payment"}
            </a>
          </p>
        ) : null}
      </header>

      {deed.agreement && deed.agreement_hash ? (
        <PublishedDeed
          agreement={deed.agreement}
          hash={deed.agreement_hash}
          struck={deed.struck_clauses}
          accepted={deed.accepted}
          registry={deed.registry}
        />
      ) : (
        <Notice tone="error">The text of this deed couldn’t be loaded. Reload the page; if it stays missing, write to us.</Notice>
      )}

      {settling ? (
        <div id="settle" className={`no-print ${SLIP}`}>
          <FeeBreakdown fees={deed.fees} maker={firstName(deed.maker.name)} graceDays={deed.agreement?.policy.grace_days ?? null} />
          <hr className="rule-double my-6" />
          {stage === "pay" ? (
            <PayStep deed={deed} takeFocus={justAccepted} awaitingCapture={awaitingCapture} onReturned={() => setAwaitingCapture(true)} />
          ) : me.isPending ? (
            <Waiting />
          ) : me.data ? (
            <Clickwrap
              slug={slug}
              email={me.data.email}
              onAccepted={(fresh) => {
                setJustAccepted(true);
                queryClient.setQueryData(queryKey, fresh);
              }}
            />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <h2 id="accept-heading" className="font-display text-h3 text-ink">
                Accept the deed
              </h2>
              <p className="m-0 text-body text-ink">
                Accepting is your signature, so first we need to know who you are. Sign in with your email and you’ll come straight back
                to this page.
              </p>
              <Button onClick={() => navigate(`/login?next=/a/${slug}`)}>Sign in to accept</Button>
            </div>
          )}
        </div>
      ) : null}

      {stage === "paid" ? <Receipt deed={deed} stamped={stampedHere} /> : null}
      {stage === "maker" ? <MakerNote deed={deed} /> : null}
      {stage === "taken" ? (
        <div className={SLIP}>
          <p className="m-0 text-body text-ink">
            {deed.accepted ? `${deed.accepted.name} accepted this deed` : "This deed has been accepted"}, and only the person who accepted it can
            pay it.
          </p>
          {me.data ? null : (
            <Button tone="plain" className="mt-4" onClick={() => navigate(`/login?next=/a/${slug}`)}>
              Sign in, if that’s you
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
