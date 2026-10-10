import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export type SignInStage = "send" | "verify" | "google";

const FALLBACK: Record<SignInStage, string> = {
  send: "We couldn’t send the code. Check the address and try again in a moment.",
  verify: "We couldn’t check that code. Try again, or ask for a new one.",
  google: "Google sign-in didn’t start. Try again, or use your email instead.",
};

const RATE_LIMITED = "We sent a code a moment ago. Wait a minute, then ask for another.";
const CODE_REFUSED =
  "That code didn’t work. It may have a typo, or it may have lapsed. Check the newest email from us, or ask for a new code.";

/** Supabase's own messages are written for developers; these say what happened and what to do next. */
export function signInProblem(error: unknown, stage: SignInStage): string {
  if (isAuthRetryableFetchError(error)) return "We couldn’t reach the sign-in service. Check your connection and try again.";
  if (isAuthError(error)) {
    switch (error.code) {
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return RATE_LIMITED;
      case "otp_expired":
        return CODE_REFUSED;
      case "email_address_invalid":
        return "That email address doesn’t look right. Check it and try again.";
      case "email_address_not_authorized":
        return "We can’t send email to that address yet. Try another address.";
      case "signup_disabled":
        return "New accounts are closed for the moment. If you already have one, use the email you signed up with.";
      case "provider_disabled":
      case "oauth_provider_not_supported":
        return "Signing in with Google isn’t available right now. Use your email instead.";
      case "email_provider_disabled":
      case "otp_disabled":
        return "Signing in by email isn’t available right now. Try again later.";
    }
    if (error.status === 429) return RATE_LIMITED;
    // supabase-js only finds the code when the API-version response header is exposed to the browser, and some proxies
    // don't expose it. A 403 from verify is always a refused code.
    if (stage === "verify" && error.status === 403) return CODE_REFUSED;
  }
  console.warn("sign-in failed", stage, error);
  return FALLBACK[stage];
}
