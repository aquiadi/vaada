import { wholeNumber } from "./numbers";
import { prepare } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

export const PERCENT_UNREADABLE = "Couldn't read a percentage. Try 'pachees percent' or '25%'.";

const FRACTIONS: Record<string, number> = {
  aadha: 50,
  adha: 50,
  half: 50,
  "ek chauthai": 25,
  chauthai: 25,
  quarter: 25,
  "a quarter": 25,
  "ek tihai": 33,
  "a third": 33,
};

/** A whole-number percentage from 1 to 100: "pachees percent", "25%", "ek chauthai". */
export function percent(raw: string): Normalized<number> {
  const { text } = prepare(raw);
  if (!text) return failed(PERCENT_UNREADABLE);
  const fraction = FRACTIONS[text];
  if (fraction !== undefined) {
    return fraction === 33 ? inferred(33, "A third reads as 33%, rounded down.") : exact(fraction);
  }
  const core = text.replace(/\s*(%|percent|per cent|pratishat|pc|ka|of the part)\s*/g, " ").trim();
  const n = wholeNumber(core);
  if (n === undefined || n < 1 || n > 100) return failed(PERCENT_UNREADABLE);
  return exact(n);
}
