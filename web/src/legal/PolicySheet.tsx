import type { ReactNode } from "react";
import { DoubleRule, Notice, PageHeader, SectionMark } from "../components/ui";
import { LAST_UPDATED_ISO, LAST_UPDATED_TEXT, POLICIES, type PolicySlug } from "./documents";

/** One policy, set as a quiet page of the deed: a heading, the draft notice, then numbered clauses. */
export function PolicySheet({ slug, lede, children }: { slug: PolicySlug; lede: ReactNode; children: ReactNode }) {
  const { title } = POLICIES[slug];
  return (
    <article className="sheet min-w-0 rounded-sm px-5 py-8 sm:px-10 sm:py-12">
      <title>{`${title} · Vaada`}</title>
      <PageHeader kicker="Vaada policies" title={title} lede={lede} />
      <div className="measure space-y-3">
        <Notice>
          Draft, pending legal review. This sets down plainly how Vaada works today. A lawyer has not yet read it, and the wording may
          change before it is final.
        </Notice>
        <p className="label">
          Last updated <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED_TEXT}</time>
        </p>
      </div>
      {children}
    </article>
  );
}

export function Clause({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
  const headingId = id ?? `clause-${n}`;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <DoubleRule className="mb-8" />
      <SectionMark n={n} title={title} id={headingId} />
      <div className="measure space-y-4 text-body text-ink [&_a]:underline [&_a]:decoration-[color-mix(in_srgb,var(--ink)_40%,transparent)] [&_a:hover]:decoration-ink">
        {children}
      </div>
    </section>
  );
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Sub-clauses lettered (a), (b), (c), the way a deed sets them. */
export function Items({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-none space-y-2">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)]">
          <span aria-hidden="true" className="text-ink-soft">
            ({LETTERS[i]})
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Something only the owner can fill in, bracketed so nobody mistakes it for the real thing. */
export function Placeholder({ children }: { children: string }) {
  return <span className="border-b border-dashed border-gold italic text-ink-soft">[{children}]</span>;
}
