export type PolicySlug = "terms" | "privacy" | "refunds" | "delivery" | "contact" | "pricing";

export interface PolicyDocument {
  slug: PolicySlug;
  path: string;
  title: string;
}

/** In the order a payment gateway's reviewer reads them, which is also the colophon's order. */
export const POLICIES: Readonly<Record<PolicySlug, PolicyDocument>> = {
  terms: { slug: "terms", path: "/legal/terms", title: "Terms of use" },
  privacy: { slug: "privacy", path: "/legal/privacy", title: "Privacy" },
  refunds: { slug: "refunds", path: "/legal/refunds", title: "Refunds and cancellations" },
  delivery: { slug: "delivery", path: "/legal/delivery", title: "Shipping and delivery" },
  contact: { slug: "contact", path: "/legal/contact", title: "Contact us" },
  pricing: { slug: "pricing", path: "/pricing", title: "Pricing" },
};

export const POLICY_LIST: readonly PolicyDocument[] = Object.values(POLICIES);

export const LAST_UPDATED_ISO = "2026-10-10";
export const LAST_UPDATED_TEXT = "10 Oct 2026";

export function findPolicy(slug: string | undefined): PolicyDocument | null {
  return POLICY_LIST.find((policy) => policy.slug === slug) ?? null;
}
