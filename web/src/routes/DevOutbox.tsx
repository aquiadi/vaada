import { useQuery } from "@tanstack/react-query";
import { Button, Mono, Notice, PageHeader, Waiting } from "../components/ui";
import { formatInstantIst } from "../format/dates";
import { ApiError, api } from "../lib/api";

interface OutboxEmail {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: string;
  created_at: string;
  html: string;
  text: string;
}

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6";

function Letter({ email, number }: { email: OutboxEmail; number: number }) {
  return (
    <li className="border-b hairline">
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[3.25rem_minmax(0,1fr)] [&::-webkit-details-marker]:hidden sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span className="figures border-r-[3px] border-double border-bahi py-3 pr-2.5 text-right font-display text-lede leading-snug text-ink-soft sm:pr-4">
            <span className="sr-only">Letter </span>
            {number}
          </span>
          <span className="min-w-0 py-3 pl-3 sm:pl-5">
            <span className="block text-body text-ink underline decoration-[color-mix(in_srgb,var(--ink)_30%,transparent)] underline-offset-[0.18em] group-open:no-underline">
              {email.subject}
            </span>
            <span className="mt-0.5 block text-note text-ink-soft">
              To <span className="break-all text-ink">{email.to}</span> · {formatInstantIst(email.created_at)} ·{" "}
              <Mono>{email.template}</Mono> · {email.status}
            </span>
          </span>
        </summary>
        <div className="grid gap-6 pt-2 pb-8 pl-[3.25rem] sm:pl-[4.5rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 pl-3 sm:pl-5">
            <p className="label m-0 mb-2">As it arrives</p>
            <iframe
              title={`Letter ${number}: ${email.subject}`}
              sandbox=""
              srcDoc={email.html}
              className="h-[32rem] w-full border hairline bg-paper"
            />
          </div>
          <div className="min-w-0 pl-3 sm:pl-5 lg:pl-0">
            <p className="label m-0 mb-2">Plain text</p>
            <pre className="m-0 max-h-[32rem] overflow-auto border hairline bg-paper p-3 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-ink">
              {email.text}
            </pre>
          </div>
        </div>
      </details>
    </li>
  );
}

export default function DevOutbox() {
  const query = useQuery({ queryKey: ["dev-outbox"], queryFn: () => api.get<{ emails: OutboxEmail[] }>("/dev/outbox") });

  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className={PAGE}>
        <PageHeader
          kicker="Outbox"
          title="There is no outbox here"
          lede="Letters are kept in an outbox only in development and the demo. Everywhere else they go out by email."
        />
      </div>
    );
  }

  const emails = query.data?.emails ?? [];
  return (
    <div className={PAGE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          kicker="Outbox · development and demo"
          title="Dispatch register"
          lede="Every letter Vaada would have sent, newest first. None of them left this machine."
        />
        <Button tone="plain" className="no-print mb-8 self-start sm:self-auto" busy={query.isFetching} onClick={() => void query.refetch()}>
          Look again
        </Button>
      </div>
      {query.isPending ? <Waiting>Opening the register.</Waiting> : null}
      {query.isError ? (
        <Notice tone="error">{query.error instanceof ApiError ? query.error.message : "The outbox didn’t load. Try again."}</Notice>
      ) : null}
      {query.isSuccess && emails.length === 0 ? <p className="m-0 text-body italic text-ink-soft">No letters yet.</p> : null}
      {emails.length > 0 ? (
        <ol reversed className="m-0 list-none border-t border-[color-mix(in_srgb,var(--ink)_40%,transparent)] p-0">
          {emails.map((email, i) => (
            <Letter key={email.id} email={email} number={emails.length - i} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}
