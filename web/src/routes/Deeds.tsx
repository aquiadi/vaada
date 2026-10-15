import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { SignInFirst } from "../books/SignInFirst";
import { Button, ButtonLink, Notice, PageHeader, Rupees, Waiting } from "../components/ui";
import { deedNumber } from "../design/DeedSheet";
import { ApiError, api } from "../lib/api";
import { explain } from "../lib/errors";
import type { DealStatus, DealSummary } from "../lib/types";
import { dayOf } from "../room/words";

const PAGE = "mx-auto max-w-4xl px-4 py-10 sm:px-6";
const TITLE = <title>Index of deeds · Vaada</title>;

const UNDER_WAY: ReadonlySet<DealStatus> = new Set(["published", "accepted", "funded", "active", "disputed"]);
const CLOSED: ReadonlySet<DealStatus> = new Set(["completed", "cancelled", "lapsed"]);

function standing(deal: DealSummary): string {
  const maker = deal.role === "maker";
  switch (deal.status) {
    case "draft":
      return "A draft, not yet sent";
    case "published":
      return maker ? "Sent, waiting to be accepted" : "Sent to you, waiting for you to accept it";
    case "accepted":
      return maker ? "Accepted, waiting for payment" : "Accepted, waiting for your payment";
    case "lapsed":
      return "Lapsed before it was paid; no money moved";
    case "funded":
      return "Paid; Razorpay holds the money";
    case "active":
      return "Under way";
    case "completed":
      return "Completed; every milestone settled";
    case "disputed":
      return "Disputed; the money stays held until Vaada decides";
    case "cancelled":
      return "Cancelled";
  }
}

function party(deal: DealSummary): string {
  if (!deal.counterparty) return deal.role === "client" ? "Maker not named" : "No client named yet";
  return deal.role === "client" ? `From ${deal.counterparty}` : `For ${deal.counterparty}`;
}

function DeedLine({ deal }: { deal: DealSummary }) {
  const to = deal.status === "draft" ? `/new/${deal.id}` : `/d/${deal.id}`;
  const total = deal.total_paise !== null && Number.isSafeInteger(deal.total_paise) ? deal.total_paise : null;
  const due = deal.next_due_at && UNDER_WAY.has(deal.status) ? deal.next_due_at : null;
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] border-b hairline sm:grid-cols-[5rem_minmax(0,1fr)]">
      <p className="figures m-0 border-r-[3px] border-double border-bahi py-3 pr-2.5 text-right font-display text-lede leading-snug text-ink-soft sm:pr-4">
        <span className="sr-only">Deed No. </span>
        {deedNumber(deal.deed_no)}
      </p>
      <div className="min-w-0 py-3 pl-3 sm:pl-5">
        {/* On a phone the title takes the whole line and the sum follows it; the dotted leader returns from sm up. */}
        <p className="m-0 flex flex-wrap items-baseline-last gap-x-2 text-body sm:flex-nowrap">
          <Link to={to} className="min-w-0 basis-full text-ink sm:basis-auto">
            {deal.title}
          </Link>
          <span aria-hidden="true" className="hidden min-w-6 flex-1 border-b border-dotted sm:block border-[color-mix(in_srgb,var(--ink)_40%,transparent)]" />
          {total !== null ? (
            <Rupees paise={total} className="shrink-0 text-ink" />
          ) : (
            <span className="shrink-0 text-note italic text-ink-soft">no sum yet</span>
          )}
        </p>
        <p className={`m-0 mt-0.5 text-note ${deal.status === "completed" ? "text-stamp" : "text-ink-soft"}`}>
          {party(deal)} · {standing(deal)}
          {due ? (
            <>
              {" · "}next due <span className="whitespace-nowrap">{dayOf(due)}</span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function Part({ id, title, deals }: { id: string; title: string; deals: DealSummary[] }) {
  if (deals.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className="mb-2 font-display text-h3 text-ink">
        {title}
      </h2>
      <ol className="m-0 list-none border-t border-[color-mix(in_srgb,var(--ink)_40%,transparent)] p-0">
        {deals.map((deal) => (
          <DeedLine key={deal.id} deal={deal} />
        ))}
      </ol>
    </section>
  );
}

function Index({ deals }: { deals: DealSummary[] }) {
  if (deals.length === 0) {
    return (
      <div className="measure">
        <p className="m-0 font-display text-h3 text-ink">No deeds yet.</p>
        <p className="m-0 mt-3 text-body text-ink-soft">
          Say what you’ll do, by when and for how much, and Vaada sets it down as a deed for your client to accept. Deeds sent to you
          by a Maker are listed here too.
        </p>
      </div>
    );
  }
  const byNumber = [...deals].sort((a, b) => b.deed_no - a.deed_no);
  return (
    <>
      <Part id="deeds-under-way" title="Under way" deals={byNumber.filter((d) => UNDER_WAY.has(d.status))} />
      <Part id="deeds-drafts" title="Drafts" deals={byNumber.filter((d) => d.status === "draft")} />
      <Part id="deeds-closed" title="Settled and closed" deals={byNumber.filter((d) => CLOSED.has(d.status))} />
    </>
  );
}

export default function Deeds() {
  const query = useQuery({ queryKey: ["deals"], queryFn: () => api.get<{ deals: DealSummary[] }>("/deals") });

  if (query.isError && query.error instanceof ApiError && query.error.status === 401) {
    return (
      <>
        {TITLE}
        <SignInFirst
          kicker="Index"
          title="Sign in to see your deeds"
          lede="Your index lists every deed you have drawn up, and every deed a Maker has sent you."
          next="/deeds"
        />
      </>
    );
  }

  return (
    <div className={PAGE}>
      {TITLE}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader kicker="Index" title="Index of deeds" lede="Every deed you are party to, by number, newest first." />
        <ButtonLink to="/new" className="no-print mb-8 self-start sm:self-auto">
          Draw up a deed
        </ButtonLink>
      </div>
      {query.isPending ? <Waiting>Opening the index.</Waiting> : null}
      {query.isError ? (
        <div>
          <Notice tone="error">{explain(query.error, "The index didn’t load. Try again in a moment.")}</Notice>
          <Button tone="plain" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {query.data ? <Index deals={query.data.deals} /> : null}
    </div>
  );
}
