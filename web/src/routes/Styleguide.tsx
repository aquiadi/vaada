import { useMemo, useReducer, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, DoubleRule, Field, Mono, Notice, PageHeader, Rupees, SectionMark, Waiting } from "../components/ui";
import { DeedSheet } from "../design/DeedSheet";
import { Seal } from "../design/Seal";
import { Struck } from "../design/Strike";
import { normalizeBlank, type NormalizeContext } from "../deed/blanks";
import { Para } from "../deed/DeedText";
import { PublishedDeed } from "../deed/PublishedDeed";
import { SAMPLE_AGREEMENT, SAMPLE_HASH } from "../deed/sample";
import { BlankInput } from "../editor/BlankInput";
import { EditorProvider } from "../editor/EditorContext";
import { Margin } from "../editor/Margin";
import { editorReducer, initialState } from "../editor/state";
import { toRoman } from "../format/roman";
import { useConfig } from "../lib/config";
import type { Blank, Draft } from "../lib/types";
import { fromIsoDate } from "../normalize/calendar";

const SWATCHES = [
  { token: "paper", role: "The page. Every screen is set on it." },
  { token: "paper-deep", role: "A second sheet: slips, the margin of a ledger." },
  { token: "ink", role: "Text, rules that matter, the primary button." },
  { token: "ink-soft", role: "Notes, hints, words that stand back." },
  { token: "bahi", role: "Margin rules, marginalia, the focused blank, the seal and destructive actions. Nothing else." },
  { token: "gold", role: "Hairlines and ornaments, sparingly. Never text." },
  { token: "stamp", role: "The guilloche and money released." },
] as const;

const TYPE = [
  { family: "font-display", size: "text-h1", sample: "Vaada, a promise kept on paper", note: "Cormorant Garamond, large sizes only" },
  { family: "font-serif", size: "text-deed", sample: "The Client shall pay the Maker ₹1,25,000 in two parts.", note: "Source Serif 4, body and deeds" },
  { family: "font-ui smallcaps", size: "text-ui", sample: "Send the deed", note: "Inter, small UI chrome only" },
  { family: "font-mono", size: "text-ui", sample: "0x6b1f…c09e", note: "IBM Plex Mono, hashes and ids" },
  { family: "font-deva", size: "text-lede", sample: "वादा, काग़ज़ पर निभाया गया", note: "Tiro Devanagari Hindi" },
] as const;

const AMOUNTS = [50_000_00, 1_25_000_00, 12_50_000_00, 99_999_99];

const SPECIMEN_WORDS: Record<string, string> = {
  total: "Ek lakh pachees hazaar",
  plan: "Aadha shuru mein, baaki delivery pe",
  "milestones.1.due": "Diwali se pehle",
};

function specimenDraft(context: NormalizeContext): Draft {
  const blanks: Record<string, Blank> = {};
  for (const [key, raw] of Object.entries(SPECIMEN_WORDS)) {
    const kind = key === "total" ? "amount" : key === "plan" ? "plan" : "date";
    const result = normalizeBlank(kind, raw, { ...context, totalPaise: 1_25_000_00 });
    blanks[key] = { raw, value: result.value, confidence: result.confidence, note: result.note ?? null, source: "dictation" };
  }
  return { blanks, struck: [], milestone_count: 2 };
}

function BlankSpecimen({ context }: { context: NormalizeContext }) {
  const [state, dispatch] = useReducer(editorReducer, specimenDraft(context), initialState);
  return (
    <EditorProvider dealId={null} state={state} dispatch={dispatch} normalizeContext={context}>
      <Para margin={<Margin keys={["total", "plan", "milestones.1.due", "revisions"]} />}>
        The Client shall pay <BlankInput blankKey="total" />, <BlankInput blankKey="plan" />. The first part is due by{" "}
        <BlankInput blankKey="milestones.1.due" />, with <BlankInput blankKey="revisions" /> rounds of revision.
      </Para>
    </EditorProvider>
  );
}

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-10">
      <p className="label m-0 mb-3">{title}</p>
      {children}
    </section>
  );
}

export default function Styleguide() {
  const { data: config } = useConfig();
  const [stampKey, setStampKey] = useState(0);
  const context = useMemo<NormalizeContext | null>(
    () => (config ? { today: fromIsoDate(config.today), maxDays: config.limits.max_deal_days, totalPaise: null } : null),
    [config],
  );
  if (!context) return <Waiting />;

  return (
    <div className="mx-auto max-w-[76rem] px-4 py-10 sm:px-8">
      <PageHeader
        kicker="For the people who build Vaada"
        title="Styleguide"
        lede="Classical Indian paperwork, set well: stamp paper, the red cloth bahi-khata, a notary's seal. A document you would trust with money, never a dashboard."
      />

      <SectionMark n={1} title="Paper and ink" />
      <ul className="m-0 mb-10 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {SWATCHES.map((s) => (
          <li key={s.token} className="sheet rounded-sm p-3">
            <div className="mb-3 h-14 rounded-xs border border-[color-mix(in_srgb,var(--ink)_20%,transparent)]" style={{ background: `var(--${s.token})` }} />
            <p className="m-0 font-mono text-micro text-ink">{s.token}</p>
            <p className="m-0 mt-1 text-note text-ink-soft">{s.role}</p>
          </li>
        ))}
      </ul>

      <SectionMark n={2} title="Type" />
      <dl className="m-0 mb-10">
        {TYPE.map((t) => (
          <div key={t.note} className="grid gap-1 border-b border-[color-mix(in_srgb,var(--ink)_14%,transparent)] py-3 md:grid-cols-[16rem_1fr]">
            <dt className="text-micro text-ink-soft">{t.note}</dt>
            <dd className={`m-0 ${t.family} ${t.size} text-ink`}>{t.sample}</dd>
          </div>
        ))}
      </dl>

      <SectionMark n={3} title="Figures and marks" />
      <div className="mb-10 grid gap-8 md:grid-cols-2">
        <Specimen title="Amounts, lining tabular, Indian grouping">
          <table className="figures w-full max-w-sm border-collapse text-body">
            <caption className="sr-only">Amounts in rupees</caption>
            <thead>
              <tr>
                <th scope="col" className="label pb-2 text-left font-normal">Paise</th>
                <th scope="col" className="label pb-2 text-right font-normal">Shown as</th>
              </tr>
            </thead>
            <tbody>
              {AMOUNTS.map((paise) => (
                <tr key={paise} className="border-t border-[color-mix(in_srgb,var(--ink)_14%,transparent)]">
                  <td className="py-1.5 font-mono text-micro text-ink-soft">{paise}</td>
                  <td className="py-1.5 text-right text-ink">
                    <Rupees paise={paise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Specimen>
        <Specimen title="Parts and rules">
          <p className="m-0 mb-4 text-body text-ink">
            Parts are numbered {[1, 2, 3, 4].map((n) => toRoman(n)).join(", ")}.
          </p>
          <DoubleRule className="mb-4" />
          <p className="m-0 text-note text-ink-soft">
            Clauses take a § as in the headings on this page. A double gold hairline divides sections; one hairline divides rows.
          </p>
        </Specimen>
      </div>

      <SectionMark n={4} title="Blanks" />
      <p className="measure mb-4 text-body text-ink-soft">
        A blank at rest is set like the words around it. Focus it to dictate with Wispr Flow or type; a dictation is read at once, typing
        after a pause. What was heard stays in the margin, and a dagger marks a guess worth checking. Try these.
      </p>
      <div className="mb-10">
        <BlankSpecimen context={context} />
      </div>

      <SectionMark n={5} title="A struck clause" />
      <Para>
        <Struck seed="styleguide">
          If the Client keeps the Maker waiting for feedback for more than seven days at a time, the Client shall pay a late fee of
          ₹500 for each further week of waiting.
        </Struck>
      </Para>
      <p className="measure mb-10 text-note text-ink-soft">The words stay readable; the pen line is ink, never red.</p>

      <SectionMark n={6} title="Controls" />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button>Send the deed</Button>
        <Button tone="plain">Copy the link</Button>
        <Button tone="quiet">Not now</Button>
        <Button tone="danger">Raise a dispute</Button>
        <Button busy>Saving</Button>
        <Button disabled>Unavailable</Button>
      </div>
      <div className="mb-6 grid max-w-xl gap-4">
        <Field label="Client's email" hint="They get a link to read the deed, accept it and pay." placeholder="rahul@kilnlabs.in" />
        <Field label="Your name, as on your bank account" error="Add the name exactly as your bank has it." defaultValue="" />
      </div>
      <div className="mb-6 grid max-w-xl gap-3">
        <Notice>Released means queued for the next settlement, not in your bank yet.</Notice>
        <Notice tone="ok">The money is held by Razorpay until you approve the work.</Notice>
        <Notice tone="error">That didn't go through. Nothing has changed; try again.</Notice>
      </div>
      <div className="mb-10">
        <ConfirmDialog
          trigger={<Button tone="plain">Approve part I</Button>}
          title="Approve part I"
          effect={
            <>
              Razorpay releases <Rupees paise={62_500_00} /> to Aditi Rao, queued for the next settlement. This can't be undone.
            </>
          }
          confirmLabel="Approve and release"
          onConfirm={() => Promise.resolve()}
        />
      </div>

      <SectionMark n={7} title="The seal" />
      <div className="mb-10 flex flex-wrap items-end gap-10">
        <figure className="m-0 text-center">
          <Seal hash={null} stamped={false} size={140} />
          <figcaption className="mt-2 text-micro text-ink-soft">Before payment</figcaption>
        </figure>
        <figure className="m-0 text-center">
          <Seal key={stampKey} hash={SAMPLE_HASH} size={140} animate />
          <figcaption className="mt-2 text-micro text-ink-soft">Funded</figcaption>
        </figure>
        <Button tone="quiet" onClick={() => setStampKey((k) => k + 1)}>
          Stamp it again
        </Button>
      </div>

      <SectionMark n={8} title="Sheets" />
      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <div className="sheet grain rounded-sm p-5">
          <p className="label m-0 mb-2">A slip</p>
          <p className="m-0 text-body text-ink">
            Depth is a paper edge, never a blur. This sheet carries hash <Mono>{SAMPLE_HASH.slice(0, 14)}…</Mono>
          </p>
        </div>
        <DeedSheet deedNo={42} compact>
          <p className="m-0 text-body text-ink">The deed border: generated guilloche, Vaada's mark and the deed number. No emblem, no state, no duty.</p>
        </DeedSheet>
      </div>

      <SectionMark n={9} title="A published deed" />
      <PublishedDeed agreement={SAMPLE_AGREEMENT} hash={SAMPLE_HASH} struck={["late_fee"]} accepted={null} registry={[]} seal={<Seal hash={SAMPLE_HASH} size={120} />} />
    </div>
  );
}
