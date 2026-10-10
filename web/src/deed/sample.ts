import { agreementHash } from "../agreement/canonical";
import type { Agreement } from "../lib/types";

/** A finished deed, used as the illustration on the home page and in the styleguide. */
export const SAMPLE_AGREEMENT: Agreement = {
  v: 1,
  deed_no: 42,
  nonce: "0x9c41e07a5d2b8f63c1a07e9d24b56f18",
  published_at: "2026-10-09T06:30:00Z",
  currency: "INR",
  maker: { name: "Aditi Rao", maker_id: "0x5b1f0c9e2d47a6831e4f9b2c7d0a3e65f81c2b94d7e0a6f3c18b5d92e4a70c61" },
  client: { name: "Rahul Mehta", organisation: "Kiln Labs" },
  work: { description: "a logo, a colour palette and a one-page set of brand guidelines", revisions: 3 },
  money: { total_paise: "2500000", client_fee_paise: "60500", platform_fee_paise: "0" },
  milestones: [
    { idx: 1, title: "Advance", deliverables: "two logo directions and a mood board", amount_paise: "1250000", due_at: "2026-10-16T18:29:59Z" },
    {
      idx: 2,
      title: "On delivery",
      deliverables: "final logo files in SVG and PNG, the palette and the guidelines PDF",
      amount_paise: "1250000",
      due_at: "2026-10-30T18:29:59Z",
    },
  ],
  clauses: {
    late_fee: null,
    kill_fee: { percent: 25 },
    ip_transfer: { exclusions: "drafts, unused concepts and the right to show the work in a portfolio" },
  },
  policy: {
    review_window_days: 5,
    hold_buffer_hours: 24,
    grace_days: 3,
    accept_pay_days: 7,
    max_deal_days: 120,
    client_fee_bps: 242,
    platform_fee_bps: 0,
  },
};

export const SAMPLE_HASH = agreementHash(SAMPLE_AGREEMENT);
