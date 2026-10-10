import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { agreementHash, canonicalJson, keccakHex } from "./canonical";

interface Vector {
  name: string;
  document: unknown;
  canonical: string;
  hash: string;
}

const vectors = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../shared/agreement-vectors.json", import.meta.url)), "utf8"),
) as Vector[];

describe("agreement canonicalisation matches the API byte for byte", () => {
  it.each(vectors.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    expect(canonicalJson(vector.document)).toBe(vector.canonical);
    expect(agreementHash(vector.document)).toBe(vector.hash);
  });

  it("refuses fractional numbers", () => {
    expect(() => canonicalJson({ amount: 25000.5 })).toThrow(TypeError);
  });

  it("hashes the empty string to keccak's known value", () => {
    expect(keccakHex("")).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  });

  it("notices a single changed character", () => {
    const vector = vectors.find((v) => v.name === "agreement")!;
    const tampered = JSON.parse(JSON.stringify(vector.document)) as { money: { total_paise: string } };
    tampered.money.total_paise = "2500001";
    expect(agreementHash(tampered)).not.toBe(vector.hash);
  });
});
