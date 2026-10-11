import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

export interface AppConfig {
  env: "dev" | "demo" | "staging" | "production";
  demo: boolean;
  supabase_url: string;
  supabase_anon_key: string;
  google_signin_enabled: boolean;
  persona_switcher: boolean;
  dev_tools: boolean;
  new_deals_paused: boolean;
  /** The owner's published details for the policy pages; each is empty until set. */
  contact: {
    address: string;
    phone: string;
    email: string;
    legal_entity: string;
    grievance_officer: string;
    jurisdiction_city: string;
  };
  gateway: "fake" | "razorpay";
  chain_id: number;
  registry_address: string | null;
  explorer_tx_url: string | null;
  fees: { client_fee_bps: number; platform_fee_bps: number };
  limits: {
    max_deal_days: number;
    review_window_days: number;
    hold_buffer_hours: number;
    grace_days: number;
    accept_pay_days: number;
    upi_limit_paise: number;
    min_deal_paise: number;
  };
  now: string;
  today: string;
}

let cached: Promise<AppConfig> | null = null;

/** The API is the single source of truth for environment, keys and limits, so the web build needs only VITE_API_URL. */
export function loadConfig(): Promise<AppConfig> {
  cached ??= request<AppConfig>("GET", "/config", undefined, { auth: false });
  return cached;
}

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => request<AppConfig>("GET", "/config", undefined, { auth: false }), staleTime: 30_000 });
}
