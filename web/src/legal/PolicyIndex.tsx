import { Link } from "react-router";
import { POLICY_LIST, type PolicySlug } from "./documents";

/** The six documents, as a book's contents: a wrapped line on a phone, a column in the margin on a wide screen. */
export function PolicyIndex({ current }: { current: PolicySlug }) {
  return (
    <nav aria-label="Policy documents" className="no-print lg:sticky lg:top-8 lg:self-start">
      <p aria-hidden="true" className="label m-0 mb-2">
        Policies
      </p>
      <ol className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 lg:flex-col lg:gap-0">
        {POLICY_LIST.map((policy) => {
          const isCurrent = policy.slug === current;
          return (
            <li key={policy.slug} className={`lg:border-l-2 lg:py-1.5 lg:pl-3 ${isCurrent ? "lg:border-ink" : "lg:border-transparent"}`}>
              <Link
                to={policy.path}
                aria-current={isCurrent ? "page" : undefined}
                className={`text-note ${isCurrent ? "text-ink no-underline" : "text-ink-soft underline decoration-[color-mix(in_srgb,var(--ink)_30%,transparent)] hover:text-ink"}`}
              >
                {policy.title}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
