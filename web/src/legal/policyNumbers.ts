import { numberWord } from "../deed/blanks";
import { useConfig, type AppConfig } from "../lib/config";

export interface PolicyNumbers {
  clientFeeBps: number;
  platformFeeBps: number;
  reviewDays: number;
  holdBufferHours: number;
  graceDays: number;
  acceptPayDays: number;
  maxDealDays: number;
  upiLimitPaise: number;
  minDealPaise: number;
}

/**
 * The figures as they stood on the date these policies were last updated. They stand in only until /config
 * answers, so a policy never shows a number the API doesn't enforce for longer than a page load.
 */
const AS_PUBLISHED: PolicyNumbers = {
  clientFeeBps: 242,
  platformFeeBps: 0,
  reviewDays: 5,
  holdBufferHours: 24,
  graceDays: 3,
  acceptPayDays: 7,
  maxDealDays: 120,
  upiLimitPaise: 1_00_000_00,
  minDealPaise: 500_00,
};

export function policyNumbersFrom(config: AppConfig): PolicyNumbers {
  return {
    clientFeeBps: config.fees.client_fee_bps,
    platformFeeBps: config.fees.platform_fee_bps,
    reviewDays: config.limits.review_window_days,
    holdBufferHours: config.limits.hold_buffer_hours,
    graceDays: config.limits.grace_days,
    acceptPayDays: config.limits.accept_pay_days,
    maxDealDays: config.limits.max_deal_days,
    upiLimitPaise: config.limits.upi_limit_paise,
    minDealPaise: config.limits.min_deal_paise,
  };
}

export function usePolicyNumbers(): PolicyNumbers {
  const { data: config } = useConfig();
  return config ? policyNumbersFrom(config) : AS_PUBLISHED;
}

/** "one day", "five days", "120 days". */
export function daysInWords(days: number): string {
  return `${numberWord(days)} ${days === 1 ? "day" : "days"}`;
}

/** "one day" for 24 hours; hours only when they don't make whole days. */
export function hoursInWords(hours: number): string {
  if (hours % 24 === 0) return daysInWords(hours / 24);
  return `${numberWord(hours)} ${hours === 1 ? "hour" : "hours"}`;
}

/** 242 basis points as "2.42%", 250 as "2.5%", 200 as "2%", in integer arithmetic. */
export function percentFromBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const hundredths = bps % 100;
  if (hundredths === 0) return `${whole}%`;
  return `${whole}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}%`;
}

/** The processing fee on a deal total, rounded up to the paisa, as the API charges it. */
export function processingFeePaise(totalPaise: number, bps: number): number {
  return Math.floor((totalPaise * bps + 9_999) / 10_000);
}
