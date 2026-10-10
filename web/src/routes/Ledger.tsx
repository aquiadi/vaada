import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { SignInFirst } from "../books/SignInFirst";
import { Button, Notice, PageHeader, Rupees, Waiting } from "../components/ui";
import { deedNumber } from "../design/DeedSheet";
import { formatInstantIst, formatIsoDate, istDateOf } from "../format/dates";
import { toRoman } from "../format/roman";
import { ApiError, api, download } from "../lib/api";

type Filter = "all" | "open" | "held" | "released";

interface LedgerEntry {
  at: string;
  deal_id: string;
  deed_no: number;
  client: string;
  milestone_idx: number | null;
  milestone_title: string | null;
  kind: "held" | "hold_extended" | "released" | "reversed" | "transfer_failed";
  particulars: string;
  held_paise: number;
  received_paise: number;
  held_balance_paise: number;
  received_total_paise: number;
  razorpay_ref: string | null;
}

interface Ledger {
  entries: LedgerEntry[];
  totals: { held_paise: number; received_paise: number };
  balances: { held_paise: number; received_paise: number };
}

const FILTERS: ReadonlyArray<{ value: Filter; label: string; empty: string }> = [
  { value: "all", label: "Every entry", empty: "Nothing has been entered yet." },
  { value: "open", label: "Open deeds", empty: "None of your open deeds has moved money yet." },
  { value: "held", label: "Held", empty: "No money has been held for you yet." },
  { value: "released", label: "Released", empty: "Nothing has been released to you yet." },
];

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6";

/** The date column is dropped on a phone, so a month heading spans three columns there and four on wider screens. */
const MONTH = "pb-1 pt-5 text-left font-display text-lede font-medium text-ink";

const monthOf = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });

function asFilter(value: string | null): Filter {
  return FILTERS.some((f) => f.value === value) ? (value as Filter) : "all";
}

/** The weekday and day without the year, which the month heading above already gives. */
function dayInMonth(at: string): string {
  return formatIsoDate(istDateOf(at)).replace(/ \d{4}$/, "");
}

function dateOf(at: string): string {
  return formatInstantIst(at).split(", ")[0] ?? "";
}

function timeOf(at: string): string {
  return formatInstantIst(at).split(", ")[1] ?? "";
}

function Particulars({ entry }: { entry: LedgerEntry }) {
  const released = entry.kind === "released";
  return (
    <>
      <p className="m-0 text-ui text-ink-soft sm:hidden">
        <span className="figures">{formatInstantIst(entry.at)}</span>
      </p>
      <p className={`m-0 ${released ? "text-stamp" : "text-ink"}`}>{entry.particulars}</p>
      <p className="m-0 text-note text-ink-soft">
        <Link to={`/d/${entry.deal_id}`} className="text-ink">
          Deed No. <span className="figures">{deedNumber(entry.deed_no)}</span>
        </Link>
        {entry.milestone_idx ? (
          <>
            {" · "}Milestone {toRoman(entry.milestone_idx)}
            {entry.milestone_title ? `, ${entry.milestone_title}` : null}
          </>
        ) : null}
        {" · "}
        {entry.client}
      </p>
      {entry.razorpay_ref ? <p className="m-0 break-all font-mono text-micro text-ink-soft">{entry.razorpay_ref}</p> : null}
    </>
  );
}

function EntryRows({ entries }: { entries: LedgerEntry[] }) {
  let month = "";
  let day = "";
  return entries.flatMap((entry, i) => {
    const rows = [];
    const entryMonth = monthOf.format(new Date(entry.at));
    if (entryMonth !== month) {
      month = entryMonth;
      day = "";
      rows.push(
        <tr key={`month-${entryMonth}`}>
          <th colSpan={3} scope="colgroup" className={`${MONTH} sm:hidden`}>
            {entryMonth}
          </th>
          <th colSpan={4} scope="colgroup" className={`${MONTH} hidden sm:table-cell`}>
            {entryMonth}
          </th>
        </tr>,
      );
    }
    const entryDay = dayInMonth(entry.at);
    const sameDay = entryDay === day;
    day = entryDay;
    rows.push(
      <tr key={`${entry.at}-${i}`} className="border-b hairline align-top">
        <td className="hidden py-2.5 pr-3 font-ui text-ui text-ink-soft sm:table-cell">
          <time dateTime={entry.at} className="figures">
            {sameDay ? (
              <>
                <span aria-hidden="true" className="block pl-3 font-serif text-body leading-tight">
                  ″
                </span>
                <span className="sr-only">{entryDay}, </span>
              </>
            ) : (
              <span className="block text-ink">{entryDay}</span>
            )}
            <span className="block">{timeOf(entry.at)}</span>
          </time>
        </td>
        <td className="min-w-0 py-2.5 pr-3 text-note sm:text-body">
          <Particulars entry={entry} />
        </td>
        <td className="border-l hairline py-2.5 pl-2 pr-1 text-right text-note text-ink sm:pl-3 sm:pr-3 sm:text-body">
          {entry.held_paise ? <Rupees paise={entry.held_paise} /> : null}
        </td>
        <td className="border-l hairline py-2.5 pl-2 text-right text-note text-ink sm:pl-3 sm:text-body">
          {entry.received_paise ? <Rupees paise={entry.received_paise} /> : null}
        </td>
      </tr>,
    );
    return rows;
  });
}

function FootRow({ label, held, received, last = false }: { label: string; held: number; received: number; last?: boolean }) {
  const rule = last ? "border-b-[3px] border-double border-b-ink" : "";
  return (
    <tr>
      <td className="hidden sm:table-cell" />
      <th scope="row" className="py-2.5 pr-3 text-left font-serif text-body font-semibold text-ink">
        {label}
      </th>
      <td className={`border-l hairline py-2.5 pl-2 pr-1 text-right text-note font-semibold text-ink sm:pl-3 sm:pr-3 sm:text-body ${rule}`}>
        <Rupees paise={held} />
      </td>
      <td className={`border-l hairline py-2.5 pl-2 text-right text-note font-semibold text-ink sm:pl-3 sm:text-body ${rule}`}>
        <Rupees paise={received} />
      </td>
    </tr>
  );
}

function LedgerTable({ ledger, filter }: { ledger: Ledger; filter: Filter }) {
  const first = ledger.entries[0];
  const last = ledger.entries[ledger.entries.length - 1];
  const span = first && last ? `from ${dateOf(first.at)} to ${dateOf(last.at)}` : "";
  const shown = FILTERS.find((f) => f.value === filter)!;
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="label pb-3 text-left">
        {filter === "all" ? "Every entry" : `${shown.label} only`}
        {span ? `, ${span}` : ""}. Times are Indian Standard Time.
      </caption>
      <thead>
        <tr className="border-b border-ink align-bottom">
          <th scope="col" className="label hidden pb-2 pr-3 text-left font-medium sm:table-cell sm:w-[7.5rem]">
            Date
          </th>
          <th scope="col" className="label pb-2 pr-3 text-left font-medium">
            Particulars
          </th>
          <th scope="col" className="w-[5.25rem] border-l hairline pb-2 pl-2 pr-1 text-right font-medium sm:w-[9.5rem] sm:pl-3 sm:pr-3">
            <span className="block font-serif text-body font-semibold text-ink">Amanat</span>
            <span className="label block">held in trust</span>
          </th>
          <th scope="col" className="w-[5rem] border-l hairline pb-2 pl-2 text-right font-medium sm:w-[9.5rem] sm:pl-3">
            <span className="block font-serif text-body font-semibold text-ink">Jama</span>
            <span className="label block">received</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <EntryRows entries={ledger.entries} />
      </tbody>
      <tfoot className="border-t border-ink">
        {filter === "all" ? (
          <FootRow label="Balance as of today" held={ledger.balances.held_paise} received={ledger.balances.received_paise} last />
        ) : (
          <>
            <FootRow label="Totals of these entries" held={ledger.totals.held_paise} received={ledger.totals.received_paise} />
            <FootRow label="Whole ledger, as of today" held={ledger.balances.held_paise} received={ledger.balances.received_paise} last />
          </>
        )}
      </tfoot>
    </table>
  );
}

function Filters({ filter, onChange }: { filter: Filter; onChange: (next: Filter) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span id={labelId} className="label">
        Show
      </span>
      <ToggleGroup.Root
        type="single"
        aria-labelledby={labelId}
        value={filter}
        onValueChange={(value) => value && onChange(value as Filter)}
        className="flex flex-wrap gap-x-4 gap-y-1"
      >
        {FILTERS.map((f) => (
          <ToggleGroup.Item
            key={f.value}
            value={f.value}
            className="smallcaps cursor-pointer border-0 border-b border-transparent bg-transparent px-0 py-1 text-ui text-ink-soft transition-colors duration-150 ease-out hover:text-ink data-[state=on]:border-ink data-[state=on]:text-ink"
          >
            {f.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}

function CsvExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await download("/ledger.csv", "vaada-ledger.csv");
    } catch (caught) {
      console.warn("ledger export failed", caught);
      setError(caught instanceof ApiError ? caught.message : "The download didn’t start. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button tone="plain" busy={busy} onClick={() => void save()}>
        Download as CSV
      </Button>
      <p className="m-0 text-note text-ink-soft">Every entry, for your accountant or your tax return. Times are in IST.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function Standing({ ledger }: { ledger: Ledger }) {
  const { held_paise: held, received_paise: received } = ledger.balances;
  if (held === 0 && received === 0) return <>No money has moved through your deeds yet.</>;
  return (
    <>
      {held > 0 ? (
        <>
          Razorpay holds <Rupees paise={held} /> in trust for you
        </>
      ) : (
        "Razorpay holds nothing for you right now"
      )}
      , and <Rupees paise={received} /> has been released to you so far.
    </>
  );
}

export default function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const filter = asFilter(params.get("filter"));
  const query = useQuery({
    queryKey: ["ledger", filter],
    queryFn: () => api.get<Ledger>(`/ledger?filter=${filter}`),
    placeholderData: keepPreviousData,
  });

  if (query.isError && query.error instanceof ApiError && query.error.status === 401) {
    return (
      <SignInFirst
        kicker="Bahi-khata"
        title="Sign in to see your ledger"
        lede="Your ledger lists every rupee your deeds have moved. Only you can see it."
        next="/ledger"
      />
    );
  }

  const ledger = query.data;
  const empty = FILTERS.find((f) => f.value === filter)!.empty;

  return (
    <div className={PAGE}>
      <PageHeader
        kicker="Bahi-khata"
        title="Your ledger"
        lede={ledger ? <Standing ledger={ledger} /> : "Every rupee your deeds have moved, entry by entry."}
      />
      <div className="measure -mt-4 mb-8 space-y-3 text-body text-ink">
        <p className="m-0">
          <i>Amanat</i> is money a client has paid that Razorpay holds in trust until the milestone is settled. <i>Jama</i> is money
          released to you. Released means it is queued for Razorpay’s next settlement, which reaches your bank on Razorpay’s schedule,
          usually within a few working days.
        </p>
      </div>

      <div className="no-print mb-6 flex flex-col gap-4 border-y hairline py-3 sm:flex-row sm:items-start sm:justify-between">
        <Filters filter={filter} onChange={(next) => setParams(next === "all" ? {} : { filter: next }, { replace: true })} />
        <CsvExport />
      </div>

      {query.isPending ? <Waiting>Opening the ledger.</Waiting> : null}
      {query.isError ? (
        <div>
          <Notice tone="error">{query.error instanceof ApiError ? query.error.message : "The ledger didn’t load. Try again in a moment."}</Notice>
          <Button tone="plain" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {ledger ? (
        <section aria-label="Ledger" aria-busy={query.isPlaceholderData || undefined} className="sheet grain relative rounded-sm">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 border-l-[3px] border-double border-bahi sm:left-8" />
          <div className="py-5 pl-6 pr-3 sm:py-8 sm:pl-14 sm:pr-8">
            {ledger.entries.length === 0 ? (
              <div className="measure py-6">
                <p className="m-0 font-display text-h3 text-ink">{empty}</p>
                <p className="m-0 mt-3 text-body text-ink-soft">
                  When a client pays for a deed, what Razorpay holds for you is entered here under amanat, and each release under jama,
                  with the date and the deed it came from.
                </p>
              </div>
            ) : (
              <LedgerTable ledger={ledger} filter={filter} />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
