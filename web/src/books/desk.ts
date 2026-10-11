export interface OpenDispute {
  id: string;
  deal_id: string;
  deed_no: string;
  milestone_idx: number;
  amount_paise: number;
  transfer_paise: number;
  reason: string;
  opened_role: "maker" | "client";
  opened_at: string;
  hold_confirmed: boolean;
  refund_deadline: string | null;
}

export interface ReconciliationFlag {
  id: string;
  deal_id: string;
  deed_no: string;
  /** Set when the flag is about one milestone, such as a release that didn't go through after a refund. */
  milestone_id: string | null;
  kind: string;
  summary: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface StuckRefund {
  milestone_id: string;
  deal_id: string;
  deed_no: string;
  milestone_idx: number;
  amount_paise: number;
  purpose: string | null;
}

export interface RegistryFailure {
  id: string;
  deal_id: string;
  deed_no: string;
  kind: string;
  attempts: number;
  error: string | null;
}

export interface PayoutAttention {
  user_id: string;
  status: string;
  legal_name: string | null;
  requirements: Array<{ field_reference?: string; reason_code?: string; description?: string; status?: string }> | null;
  updated_at: string | null;
}

export interface WebhookFailure {
  event_id: string;
  type: string;
  attempts: number;
  error: string | null;
  received_at: string;
}

export interface RefundWindow {
  deal_id: string;
  deed_no: string;
  status: string;
  captured_at: string | null;
  refund_deadline: string | null;
}

export interface DeskQueue {
  disputes: OpenDispute[];
  flags: ReconciliationFlag[];
  stuck_refunds: StuckRefund[];
  registry_failures: RegistryFailure[];
  payout_accounts: PayoutAttention[];
  webhook_failures: WebhookFailure[];
  refund_deadlines: RefundWindow[];
  admin: string;
}

export type Resolution = "release" | "refund" | "split";

export interface ResolutionPreview {
  resolution: Resolution;
  refund_paise: number;
  maker_receives_paise: number;
  client_sentence: string;
  maker_sentence: string;
}
