import { describe, expect, it } from "vitest";
import { isBurst } from "./dictation";

const input = (inputType: string) => ({ inputType }) as InputEvent;

describe("isBurst", () => {
  it("reads a paste or a drop as a burst", () => {
    expect(isBurst(input("insertFromPaste"), 1, 0, 1000)).toBe(true);
    expect(isBurst(input("insertFromDrop"), 1, 0, 1000)).toBe(true);
  });

  it("reads several characters with no key behind them as a burst", () => {
    expect(isBurst(input("insertText"), 14, 0, 1000)).toBe(true);
  });

  it("reads one typed character, or text right after a key, as typing", () => {
    expect(isBurst(input("insertText"), 1, 0, 1000)).toBe(false);
    expect(isBurst(input("insertText"), 3, 990, 1000)).toBe(false);
  });
});
