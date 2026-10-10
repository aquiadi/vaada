import { formatInstantIst, formatIsoDate, istDateOf } from "../format/dates";
import type { MilestoneStatus, Room, RoomMilestone } from "../lib/types";

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** "Wed 14 Oct 2026" for a due date, which the API stores as the last second of that day in IST. */
export function dayOf(isoInstant: string): string {
  return formatIsoDate(istDateOf(isoInstant));
}

export function milestoneStanding(m: RoomMilestone): string {
  switch (m.status) {
    case "unfunded":
      return "Not yet paid";
    case "held":
      return "Held by Razorpay";
    case "delivered":
      return m.review_ends_at ? `Delivered, in review until ${formatInstantIst(m.review_ends_at)}` : "Delivered, in review";
    case "released":
      return "Released for the next settlement";
    case "refund_requested":
      return "Refund on its way";
    case "refunded":
      return "Refunded";
    case "disputed":
      return "Disputed, held until Vaada decides";
    case "resolved":
      return "Decided";
    case "cancelled":
      return "Cancelled";
  }
}

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Who a role is, from where the reader sits: "you" for their own side, otherwise a name. */
export function partyName(room: Room, role: string): string {
  if (role === room.role) return "you";
  if (role === "maker") return room.maker.name;
  if (role === "client") return room.client.name;
  return "Vaada";
}

export function otherParty(room: Room): string {
  return room.role === "maker" ? room.client.name : room.maker.name;
}

const HELD: ReadonlySet<MilestoneStatus> = new Set(["held", "delivered", "disputed", "refund_requested"]);
const SETTLED: ReadonlySet<MilestoneStatus> = new Set(["released", "refunded", "resolved", "cancelled"]);

export function dealStanding(room: Room): string {
  switch (room.status) {
    case "draft":
      return "Still a draft.";
    case "published":
      return room.accept_until
        ? `Sent to ${room.client.name}. Waiting for them to accept it by ${dayOf(room.accept_until)}.`
        : `Sent to ${room.client.name}. Waiting for them to accept it.`;
    case "accepted": {
      if (room.payment?.status === "authorized") return "Payment made. Razorpay is confirming it; this page updates by itself.";
      const by = room.pay_by ? ` by ${dayOf(room.pay_by)}` : "";
      return room.role === "client"
        ? `You accepted this deed. Pay${by} so the work can begin.`
        : `Accepted by ${room.accepted?.name ?? room.client.name}. Waiting for payment${by}.`;
    }
    case "lapsed":
      return "Lapsed. Its first date passed before it was accepted and paid, so no money moved.";
    case "funded":
      return "Paid. Razorpay holds the money, and the work can begin.";
    case "active": {
      const settled = room.milestones.filter((m) => SETTLED.has(m.status)).length;
      return `Under way: ${settled} of ${room.milestones.length} milestones settled.`;
    }
    case "completed":
      return "Completed. Every milestone is settled.";
    case "disputed":
      return "Disputed. The money on the disputed milestone stays held until Vaada decides.";
    case "cancelled":
      return "Cancelled. The ledger below shows where each part of the money went.";
  }
}


export interface MoneyStanding {
  heldPaise: number;
  releasedPaise: number;
  refundedPaise: number;
  unpaidPaise: number;
}

/** Where the deal total stands, counted on milestone amounts so the parts add back up to the total. */
export function moneyStanding(room: Room): MoneyStanding {
  const open = room.status !== "lapsed" && room.status !== "cancelled";
  const standing: MoneyStanding = { heldPaise: 0, releasedPaise: 0, refundedPaise: 0, unpaidPaise: 0 };
  for (const m of room.milestones) {
    standing.refundedPaise += m.refund_paise;
    if (m.released_at) standing.releasedPaise += m.amount_paise - Math.min(m.refund_paise, m.amount_paise);
    else if (HELD.has(m.status)) standing.heldPaise += m.amount_paise;
    else if (m.status === "unfunded" && open) standing.unpaidPaise += m.amount_paise;
  }
  return standing;
}

/** True while something the page shows is still being confirmed by Razorpay or the chain. */
export function stillSettling(room: Room): boolean {
  return (
    room.registry.some((r) => r.status === "queued" || r.status === "sent") ||
    room.payment?.status === "authorized" ||
    room.milestones.some((m) => m.status === "refund_requested") ||
    room.disputes.some((d) => d.status === "open" && !d.hold_confirmed)
  );
}
