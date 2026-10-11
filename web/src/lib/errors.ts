import { ApiError } from "./api";

/**
 * The sentence to show for a failed request. The API's own message when it gave one; otherwise the fallback,
 * and the unexpected error goes to the console, since it is a bug rather than something the person did.
 */
export function explain(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  console.warn(fallback, error);
  return fallback;
}
