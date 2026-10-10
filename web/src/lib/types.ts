import type { Confidence } from "../normalize";

export interface Blank {
  raw: string;
  value: unknown;
  confidence: Confidence | null;
  note: string | null;
  /** "plan" when the payment plan filled this blank rather than the person. */
  source?: "dictation" | "plan" | null;
  dictationId?: string | null;
}

export interface Draft {
  blanks: Record<string, Blank>;
  struck: string[];
  milestone_count: number;
}

export interface Payout {
  status: "draft" | "under_review" | "needs_clarification" | "activated" | "suspended" | "rejected";
  legal_name: string | null;
  business_type: string | null;
  bank_last4: string | null;
  ifsc: string | null;
  requirements: Array<{ field_reference?: string; reason_code?: string; description?: string; status?: string }>;
  activated_at: string | null;
}

export interface Me {
  id: string;
  email: string | null;
  display_name: string | null;
  handle: string | null;
  maker_id: string | null;
  is_admin: boolean;
  is_persona: boolean;
  payout: Payout | null;
}

export interface Action {
  action: string;
  label: string;
  effect: string;
}

export interface RegistryEntry {
  kind: string;
  status: "queued" | "sent" | "confirmed" | "failed";
  tx_hash: string | null;
  tx_url: string | null;
  milestone_idx: number | null;
  created_at: string | null;
  confirmed_at: string | null;
}

export type MilestoneStatus =
  | "unfunded"
  | "held"
  | "delivered"
  | "released"
  | "refund_requested"
  | "refunded"
  | "disputed"
  | "resolved"
  | "cancelled";

export interface RoomMilestone {
  id: string;
  idx: number;
  title: string;
  deliverables: string;
  amount_paise: number;
  transfer_paise: number;
  due_at: string;
  status: MilestoneStatus;
  delivered_at: string | null;
  delivery_note: string | null;
  review_ends_at: string | null;
  hold_until: string | null;
  released_at: string | null;
  refunded_at: string | null;
  refund_paise: number;
  refund_opens_at: string;
  revisions_logged: number;
  registry: RegistryEntry[];
  actions: Action[];
}

export interface Agreement {
  v: number;
  deed_no: number;
  nonce: string;
  published_at: string;
  currency: "INR";
  maker: { name: string; maker_id: string };
  client: { name: string; organisation: string | null };
  work: { description: string; revisions: number | "unlimited" };
  money: { total_paise: string; client_fee_paise: string; platform_fee_paise: string };
  milestones: Array<{ idx: number; title: string; deliverables: string; amount_paise: string; due_at: string }>;
  clauses: {
    late_fee: { days: number; amount_paise: string } | null;
    kill_fee: { percent: number } | null;
    ip_transfer: { exclusions: string } | null;
  };
  policy: {
    review_window_days: number;
    hold_buffer_hours: number;
    grace_days: number;
    accept_pay_days: number;
    max_deal_days: number;
    client_fee_bps: number;
    platform_fee_bps: number;
  };
}

export type DealStatus =
  | "draft"
  | "published"
  | "accepted"
  | "lapsed"
  | "funded"
  | "active"
  | "completed"
  | "disputed"
  | "cancelled";

export interface Acceptance {
  name: string;
  email_masked: string;
  at: string;
}

export interface Room {
  id: string;
  slug: string;
  deed_no: number;
  status: DealStatus;
  title: string;
  role: "maker" | "client" | null;
  maker: { name: string; handle: string | null; maker_id: string | null };
  client: { name: string; email_masked: string | null };
  draft: Draft | null;
  draft_version: number;
  agreement: Agreement | null;
  agreement_hash: string | null;
  agreement_nonce: string | null;
  struck_clauses: string[];
  published_at: string | null;
  accepted: Acceptance | null;
  pay_by: string | null;
  accept_until: string | null;
  money: { total_paise: number | null; client_fee_paise: number; order_paise: number; platform_fee_paise: number; transfers_paise: number };
  payment: { status: string; method: string | null; captured_at: string | null; refund_deadline: string | null } | null;
  bank_last4: string | null;
  revisions_allowed: number | "unlimited" | null;
  revisions_logged: number;
  milestones: RoomMilestone[];
  actions: Action[];
  events: Array<{ at: string; kind: string; summary: string; role: string; milestone_idx: number | null }>;
  registry: RegistryEntry[];
  cancellations: Array<{
    id: string;
    status: string;
    proposed_role: string;
    reason: string;
    created_at: string;
    effect: string | null;
    can_respond: boolean;
    can_withdraw: boolean;
  }>;
  date_changes: Array<{
    id: string;
    milestone_idx: number;
    old_due_at: string;
    new_due_at: string;
    reason: string;
    status: string;
    proposed_role: string;
    can_respond: boolean;
  }>;
  disputes: Array<{
    id: string;
    milestone_idx: number;
    status: string;
    reason: string;
    opened_role: string;
    resolution: string | null;
    refund_paise: number | null;
    release_paise: number | null;
    notes: string | null;
    created_at: string;
    resolved_at: string | null;
    hold_confirmed: boolean;
  }>;
  voice_updates: Array<{ id: string; raw_text: string; proposed_actions: unknown[]; status: string; created_at: string; mine: boolean }>;
  now: string;
}

export interface PublicDeed {
  slug: string;
  deal_id: string | null;
  deed_no: number;
  status: DealStatus;
  title: string;
  viewer_role: "maker" | "client" | null;
  maker: { name: string; handle: string | null; maker_id: string | null };
  client: { name: string };
  agreement: Agreement | null;
  agreement_hash: string | null;
  agreement_nonce: string | null;
  struck_clauses: string[];
  fees: { total_paise: number; client_fee_paise: number; order_paise: number; upi_allowed: boolean };
  accept_until: string | null;
  accept_until_day: string | null;
  pay_by: string | null;
  accepted: Acceptance | null;
  paid: boolean;
  milestones: Array<{ idx: number; title: string; amount_paise: number; status: MilestoneStatus; due_at: string }>;
  registry: RegistryEntry[];
  registry_pending: boolean;
}

export interface DealSummary {
  id: string;
  slug: string;
  deed_no: number;
  title: string;
  status: DealStatus;
  role: "maker" | "client" | null;
  counterparty: string | null;
  client_email_masked: string | null;
  total_paise: number | null;
  next_due_at: string | null;
  updated_at: string;
}

export interface CheckoutOrder {
  gateway: "fake" | "razorpay";
  key_id: string;
  order_id: string;
  amount_paise: number;
  upi_allowed: boolean;
  options: Record<string, unknown>;
}
