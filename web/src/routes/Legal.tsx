import { Link, useLocation, useParams } from "react-router";
import { DoubleRule, Mono } from "../components/ui";
import { ContactUs } from "../legal/ContactUs";
import { DeliveryPolicy } from "../legal/DeliveryPolicy";
import { findPolicy, POLICY_LIST, type PolicySlug } from "../legal/documents";
import { PolicyIndex } from "../legal/PolicyIndex";
import { Pricing } from "../legal/Pricing";
import { PrivacyPolicy } from "../legal/PrivacyPolicy";
import { RefundPolicy } from "../legal/RefundPolicy";
import { TermsOfUse } from "../legal/TermsOfUse";

const PAGE = "mx-auto max-w-6xl px-4 py-10 sm:px-6";

function PolicyText({ slug }: { slug: PolicySlug }) {
  switch (slug) {
    case "terms":
      return <TermsOfUse />;
    case "privacy":
      return <PrivacyPolicy />;
    case "refunds":
      return <RefundPolicy />;
    case "delivery":
      return <DeliveryPolicy />;
    case "contact":
      return <ContactUs />;
    case "pricing":
      return <Pricing />;
  }
}

function UnknownPolicy({ path }: { path: string }) {
  return (
    <article className="measure">
      <title>Policy not found · Vaada</title>
      <p className="label m-0 mb-2">Not found</p>
      <h1 className="font-display text-h2 leading-tight text-ink sm:text-h1">There is no policy at this address.</h1>
      <p className="mt-4 mb-0 text-lede text-ink-soft">
        Nothing is filed under <Mono className="text-ink">{path}</Mono>. These are the policies Vaada keeps:
      </p>
      <DoubleRule className="my-8 max-w-48" />
      <ul className="m-0 list-none space-y-2 p-0 text-body">
        {POLICY_LIST.map((policy) => (
          <li key={policy.slug}>
            <Link to={policy.path} className="underline decoration-[color-mix(in_srgb,var(--ink)_40%,transparent)] hover:decoration-ink">
              {policy.title}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Serves /legal/:doc and /pricing, which payment gateways read before they activate an account. */
export default function Legal() {
  const { doc } = useParams();
  const { pathname } = useLocation();
  const policy = findPolicy(pathname === "/pricing" ? "pricing" : doc);
  if (!policy) {
    return (
      <div className={`${PAGE} sm:py-16`}>
        <UnknownPolicy path={pathname} />
      </div>
    );
  }
  return (
    <div className={PAGE}>
      <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,47rem)] lg:justify-center lg:gap-12">
        <PolicyIndex current={policy.slug} />
        <PolicyText slug={policy.slug} />
      </div>
    </div>
  );
}
