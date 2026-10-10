import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Byte-identical to the API's canonical_json: keys sorted by code point, no whitespace, non-ASCII left
 * as UTF-8. shared/agreement-vectors.json holds both sides to it.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new TypeError("Agreements carry no fractional numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new TypeError(`Cannot canonicalise ${typeof value}`);
}

export function keccakHex(text: string): string {
  return `0x${bytesToHex(keccak_256(utf8ToBytes(text)))}`;
}

export function agreementHash(document: unknown): string {
  return keccakHex(canonicalJson(document));
}
