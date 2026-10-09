export type Confidence = "exact" | "inferred" | "failed";

export interface Normalized<T> {
  value: T | null;
  confidence: Confidence;
  note?: string;
}

export function exact<T>(value: T, note?: string): Normalized<T> {
  return note ? { value, confidence: "exact", note } : { value, confidence: "exact" };
}

export function inferred<T>(value: T, note?: string): Normalized<T> {
  return note ? { value, confidence: "inferred", note } : { value, confidence: "inferred" };
}

export function failed<T>(note: string): Normalized<T> {
  return { value: null, confidence: "failed", note };
}
