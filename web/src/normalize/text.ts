import { stripFiller, undoWisprFormatting } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

const NAME_PREFIX = /^(my name is|mera naam|naam hai|name is|i am|i'm|main|this is|client is|client hai)\s+/i;
const NAME_SUFFIX = /\s+(hai|hain|hoon|hu|here)$/i;

function capitaliseWord(word: string): string {
  if (/\p{Script=Devanagari}/u.test(word)) return word;
  if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;
  return word
    .toLowerCase()
    .split(/([-'’])/)
    .map((part) => (part.length > 0 && /[a-z]/.test(part[0]!) ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join("");
}

/** Names: trim, drop "my name is", capitalise each word. */
export function personName(raw: string): Normalized<string> {
  const cleaned = stripFiller(undoWisprFormatting(raw)).replace(NAME_PREFIX, "").replace(NAME_SUFFIX, "").trim();
  if (!cleaned) return failed("Add a name here.");
  if (/\d/.test(cleaned)) return failed("A name shouldn't have numbers in it. Check what landed here.");
  const value = cleaned.split(/\s+/).map(capitaliseWord).join(" ");
  return exact(value);
}

/** Organisations are kept the way they were said: "Kiln Labs", "kiln.studio". */
export function organisation(raw: string): Normalized<string> {
  const cleaned = undoWisprFormatting(raw).trim();
  if (!cleaned) return failed("Add the organisation, or strike this line if there isn't one.");
  return exact(cleaned);
}

const SENTENCE_STARTERS = new Set([
  "a",
  "an",
  "the",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "some",
  "all",
  "my",
  "our",
  "their",
  "new",
  "complete",
  "full",
  "ek",
  "do",
  "teen",
  "char",
  "paanch",
]);

/**
 * The work slots into a sentence ("The Maker shall deliver [the work]"), so Wispr's capital on a
 * common first word is undone; a name or brand at the start keeps its capital.
 */
export function work(raw: string): Normalized<string> {
  const cleaned = undoWisprFormatting(raw).trim();
  if (!cleaned) return failed("Say what you'll deliver, in a line or two.");
  const [first = "", ...rest] = cleaned.split(" ");
  const value = SENTENCE_STARTERS.has(first.toLowerCase()) ? [first.toLowerCase(), ...rest].join(" ") : cleaned;
  return exact(value);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Wispr may write "rahul at gmail dot com"; fold the spoken form back into an address. */
export function email(raw: string): Normalized<string> {
  const original = undoWisprFormatting(raw).trim();
  if (!original) return failed("Add the client's email address.");
  const spoken = /\s(at|dot)\s/i.test(` ${original} `);
  const value = original
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (!EMAIL.test(value)) return failed("That doesn't look like an email address. Check it, or type it in.");
  return spoken ? inferred(value, `Read this as ${value}.`) : exact(value);
}
