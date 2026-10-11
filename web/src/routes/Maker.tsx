import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { DeedSheet } from "../design/DeedSheet";
import { Button, ButtonLink, Mono, Notice, PageHeader, Rupees, Waiting } from "../components/ui";
import { RegistryLink } from "../deed/PublishedDeed";
import { formatDeedDate, istDateOf } from "../format/dates";
import { formatRupees, rupeesInWords } from "../format/money";
import { toRoman } from "../format/roman";
import { ApiError, api } from "../lib/api";
import { explain } from "../lib/errors";
import { useConfig } from "../lib/config";
import type { RegistryEntry } from "../lib/types";
import { dayOf } from "../room/words";

interface ReleasedMilestone {
  deed_no: string;
  idx: number;
  released_paise: number;
  released_at: string;
  deal_hash: string | null;
  registry: RegistryEntry | null;
}

interface MakerCertificate {
  display_name: string | null;
  handle: string;
  maker_id: string | null;
  since: string;
  milestones: ReleasedMilestone[];
  total_released_paise: number;
  deeds: number;
  registry_address: string | null;
  chain_id: number;
}

const PAGE = "mx-auto max-w-4xl px-4 py-10 sm:px-6";
const UNOPENED_TITLE = <title>Certificate · Vaada</title>;

function chainName(chainId: number): string {
  switch (chainId) {
    case 137:
      return "Polygon";
    case 80002:
      return "Polygon’s Amoy test network";
    case 31337:
      return "a local test chain";
    default:
      return `chain ${chainId}`;
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function MilestoneLine({ milestone: m }: { milestone: ReleasedMilestone }) {
  return (
    <li className="border-b hairline py-3">
      <p className="m-0 flex items-baseline-last justify-between gap-4 text-body text-ink">
        <span>
          <span className="whitespace-nowrap">
            Deed No. <span className="figures">{m.deed_no}</span> ·
          </span>{" "}
          <span className="whitespace-nowrap">Milestone {toRoman(m.idx)} ·</span>{" "}
          <span className="whitespace-nowrap">released {dayOf(m.released_at)}</span>
        </span>
        <Rupees paise={m.released_paise} className="shrink-0" />
      </p>
      <dl className="m-0 mt-1 grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-2 text-micro text-ink-soft">
        <dt className="label">Registry</dt>
        <dd className="m-0">{m.registry ? <RegistryLink entry={m.registry} /> : <span className="italic">Not yet recorded</span>}</dd>
        {m.deal_hash ? (
          <>
            <dt className="label">Deed hash</dt>
            <dd className="m-0 break-all font-mono">{m.deal_hash}</dd>
          </>
        ) : null}
      </dl>
    </li>
  );
}

function Certificate({ maker }: { maker: MakerCertificate }) {
  const { data: config } = useConfig();
  const name = maker.display_name ?? maker.handle;
  const count = maker.milestones.length;
  return (
    <DeedSheet title="CERTIFICATE">
      <article aria-labelledby="certificate-name" className="mx-auto max-w-[62ch]">
        <p className="label m-0 text-center">Certificate of milestones released</p>
        <h1 id="certificate-name" className="m-0 mt-3 text-center font-display text-h2 leading-tight text-ink sm:text-h1">
          {name}
        </h1>
        <p className="m-0 mt-2 text-center text-body italic text-ink-soft">A Maker on Vaada since {formatDeedDate(istDateOf(maker.since))}</p>
        {maker.maker_id ? (
          <div className="mt-5 text-center">
            <p className="label m-0">Maker ID</p>
            <Mono className="text-ink">{maker.maker_id}</Mono>
          </div>
        ) : null}

        <hr className="rule-double my-8" />

        {count === 0 ? (
          <p className="m-0 text-deed text-ink">
            No milestone has been released to {name} yet. When one is, it is entered here and on the public registry, with the day it
            was released.
          </p>
        ) : (
          <>
            <p className="drop-cap m-0 text-deed text-ink">
              Vaada’s records show that {name} has completed {plural(count, "milestone", "milestones")} under{" "}
              {plural(maker.deeds, "deed", "deeds")}, and that{" "}
              <span className="figures whitespace-nowrap">{formatRupees(maker.total_released_paise)}</span> (
              {rupeesInWords(maker.total_released_paise)}) has been released to them for settlement.
            </p>

            <h2 className="label m-0 mb-1 mt-8">The milestones, latest first</h2>
            <ol className="m-0 list-none border-t border-[color-mix(in_srgb,var(--ink)_40%,transparent)] p-0">
              {maker.milestones.map((m) => (
                <MilestoneLine key={`${m.deed_no}-${m.idx}`} milestone={m} />
              ))}
            </ol>
            <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-4 border-b-[3px] border-double border-ink py-3 text-body font-semibold text-ink">
              <span>Total released</span>
              <Rupees paise={maker.total_released_paise} />
            </p>
            <p className="m-0 mt-2 text-right text-note italic text-ink-soft">{rupeesInWords(maker.total_released_paise)}</p>
          </>
        )}

        <hr className="rule-double my-8" />

        <section aria-labelledby="certificate-check" className="text-note text-ink">
          <h2 id="certificate-check" className="label m-0 mb-2">
            How to check this
          </h2>
          <p className="m-0">
            Anyone can count these. When a milestone’s money is released, Vaada writes a <i>Released</i> event to its public registry
            contract on {chainName(maker.chain_id)}, and the link beside each line opens that record.
          </p>
          <p className="m-0 mt-2">
            On the chain, a Maker appears only as the Maker ID above. It is a random number given when they joined, not derived from
            their name, email or bank account, so the registry alone can’t tell who earned these. This page is what puts the name
            beside it. No client is named, here or on the chain.
          </p>
          {maker.registry_address ? (
            <p className="m-0 mt-3">
              <span className="label mr-2">Registry contract</span>
              <Mono>{maker.registry_address}</Mono>
            </p>
          ) : null}
        </section>
        {config ? (
          <p className="m-0 mt-8 text-center text-note italic text-ink-soft">Drawn from Vaada’s records on {formatDeedDate(config.today)}.</p>
        ) : null}
      </article>
    </DeedSheet>
  );
}

export default function Maker() {
  const { handle = "" } = useParams();
  const query = useQuery({
    queryKey: ["maker", handle],
    queryFn: () => api.get<MakerCertificate>(`/public/makers/${encodeURIComponent(handle)}`),
  });

  if (query.isPending) {
    return (
      <>
        {UNOPENED_TITLE}
        <Waiting>Fetching the certificate.</Waiting>
      </>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <div className={PAGE}>
          <title>Certificate not found · Vaada</title>
          <PageHeader
            kicker="Certificate"
            title="No Maker at this address"
            lede={`There is no certificate for “${handle}”. Check the link; the part after /m/ is the Maker’s handle.`}
          />
          <ButtonLink to="/" tone="plain">
            Vaada’s front page
          </ButtonLink>
        </div>
      );
    }
    return (
      <div className={PAGE}>
        {UNOPENED_TITLE}
        <Notice tone="error">{explain(query.error, "The certificate didn’t load. Try again in a moment.")}</Notice>
        <Button tone="plain" className="mt-4" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className={PAGE}>
      <title>{`Certificate of ${query.data.display_name ?? query.data.handle} · Vaada`}</title>
      <Certificate maker={query.data} />
    </div>
  );
}
