import { describe, expect, it } from "vitest";
import type { Room, RoomMilestone } from "../lib/types";
import { dealStanding, heldPaise, milestoneStanding, moneyStanding, partyName, stillSettling } from "./words";

function milestone(idx: number, overrides: Partial<RoomMilestone> = {}): RoomMilestone {
  return {
    id: `m${idx}`,
    idx,
    title: `Part ${idx}`,
    deliverables: "Files",
    amount_paise: 1_250_000,
    transfer_paise: 1_250_000,
    due_at: "2026-10-14T18:29:59+00:00",
    status: "held",
    delivered_at: null,
    delivery_note: null,
    review_ends_at: null,
    hold_until: null,
    released_at: null,
    refunded_at: null,
    refund_paise: 0,
    refund_opens_at: "2026-10-17T18:29:59+00:00",
    revisions_logged: 0,
    registry: [],
    actions: [],
    ...overrides,
  };
}

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "deal",
    slug: "slug",
    deed_no: 2,
    status: "active",
    title: "Brand identity",
    role: "maker",
    maker: { name: "Aditi Rao", handle: "aditi-rao", maker_id: null },
    client: { name: "Rahul Mehta", email_masked: "r***@kilnlabs.dev" },
    draft: null,
    draft_version: 1,
    agreement: null,
    agreement_hash: null,
    agreement_nonce: null,
    struck_clauses: [],
    published_at: "2026-09-27T19:54:11+00:00",
    accepted: null,
    pay_by: null,
    accept_until: null,
    money: { total_paise: 2_500_000, client_fee_paise: 60_500, order_paise: 2_560_500, platform_fee_paise: 0, transfers_paise: 2_500_000 },
    payment: { status: "captured", method: "upi", captured_at: "2026-09-27T19:54:11+00:00", refund_deadline: null },
    bank_last4: "4417",
    revisions_allowed: 3,
    revisions_logged: 0,
    milestones: [milestone(1), milestone(2)],
    actions: [],
    events: [],
    registry: [],
    cancellations: [],
    date_changes: [],
    disputes: [],
    voice_updates: [],
    now: "2026-10-10T06:00:00+00:00",
    ...overrides,
  };
}

describe("moneyStanding", () => {
  it("adds the parts back up to the deal total", () => {
    const standing = moneyStanding(
      room({
        milestones: [
          milestone(1, { status: "released", released_at: "2026-10-01T19:54:12+00:00" }),
          milestone(2, { status: "delivered" }),
        ],
      }),
    );
    expect(standing).toEqual({ heldPaise: 1_250_000, releasedPaise: 1_250_000, toMakerPaise: 1_250_000, refundedPaise: 0, unpaidPaise: 0 });
  });

  it("splits a decided milestone between what was released and what was refunded", () => {
    const standing = moneyStanding(
      room({
        status: "completed",
        milestones: [milestone(1, { status: "resolved", released_at: "2026-10-05T10:00:00+00:00", refund_paise: 500_000 })],
      }),
    );
    expect(standing.releasedPaise).toBe(750_000);
    expect(standing.refundedPaise).toBe(500_000);
  });

  it("counts what reaches the Maker after Vaada's fee and tax, apart from the gross release", () => {
    const standing = moneyStanding(
      room({
        milestones: [
          milestone(1, { status: "released", released_at: "2026-10-01T19:54:12+00:00", transfer_paise: 1_200_000 }),
          milestone(2, { status: "resolved", released_at: "2026-10-05T10:00:00+00:00", transfer_paise: 1_200_000, refund_paise: 500_000 }),
        ],
      }),
    );
    expect(standing.releasedPaise).toBe(2_000_000);
    expect(standing.toMakerPaise).toBe(1_900_000);
  });

  it("does not call a lapsed deed's parts unpaid", () => {
    const standing = moneyStanding(room({ status: "lapsed", payment: null, milestones: [milestone(1, { status: "unfunded" })] }));
    expect(standing.unpaidPaise).toBe(0);
  });
});

describe("stillSettling", () => {
  it("keeps polling while a registry record is unconfirmed", () => {
    const queued = { kind: "Delivered", status: "queued" as const, tx_hash: null, tx_url: null, milestone_idx: 1, created_at: null, confirmed_at: null };
    expect(stillSettling(room({ registry: [queued] }))).toBe(true);
  });

  it("keeps polling while a payment is authorized but not captured", () => {
    expect(stillSettling(room({ payment: { status: "authorized", method: null, captured_at: null, refund_deadline: null } }))).toBe(true);
  });

  it("keeps polling while a refund is on its way", () => {
    expect(stillSettling(room({ milestones: [milestone(1, { status: "refund_requested" })] }))).toBe(true);
  });

  it("stops when everything is confirmed", () => {
    expect(stillSettling(room())).toBe(false);
  });
});

describe("words", () => {
  it("says when a delivered milestone's review ends, in IST", () => {
    expect(milestoneStanding(milestone(2, { status: "delivered", review_ends_at: "2026-10-13T19:54:12+00:00" }))).toBe(
      "Delivered, in review until 14 Oct 2026, 01:24 IST",
    );
  });

  it("calls a release what it is: queued for the next settlement", () => {
    expect(milestoneStanding(milestone(1, { status: "released" }))).toBe("Released for the next settlement");
  });

  it("counts settled milestones for a deal under way", () => {
    const active = room({ milestones: [milestone(1, { status: "released" }), milestone(2)] });
    expect(dealStanding(active)).toBe("Under way: 1 of 2 milestones settled.");
  });

  it("names the reader's own side as you", () => {
    expect(partyName(room(), "maker")).toBe("you");
    expect(partyName(room(), "client")).toBe("Rahul Mehta");
  });
});

describe("heldPaise", () => {
  it("counts only the parts Razorpay still holds", () => {
    const parts = [
      { amount_paise: 1_250_000, status: "released" as const },
      { amount_paise: 750_000, status: "delivered" as const },
      { amount_paise: 500_000, status: "disputed" as const },
      { amount_paise: 250_000, status: "refunded" as const },
    ];
    expect(heldPaise(parts)).toBe(1_250_000);
  });
});
