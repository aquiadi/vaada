import { wholeNumber } from "./numbers";
import { lastClause, prepare, stripFiller } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

export type RevisionCount = number | "unlimited";

export const COUNT_UNREADABLE = "Couldn't read a number here. Try 'teen' or '3'.";
export const UNLIMITED_NOTE = "Unlimited revisions is how freelancers get stuck. Sure?";
const MAX_REVISIONS = 20;

const UNLIMITED =
  /\b(unlimited|infinite|limitless|jitne chahiye|jitni chahiye|jitna chahiye|jitne bhi|koi limit nahi|koi limit nahin|no limit|as many as (needed|they want|you want|required)|bina limit|anant)\b/;
const NONE = /^(none|no revisions?|zero|koi nahi|koi nahin|kuch nahi|nil|0)$/;
const NOUNS =
  /\b(revisions?|revision tak|rounds?|round|changes?|badlav|iterations?|baar|times|tak|ka|ki|ke|of|feedback|edits?|max|maximum|upto|up to|at most|sirf|only|bas)\b/g;

export function count(raw: string): Normalized<RevisionCount> {
  const { text } = prepare(raw);
  if (!text) return failed(COUNT_UNREADABLE);
  if (UNLIMITED.test(text)) return inferred("unlimited", UNLIMITED_NOTE);
  const core = text.replace(NOUNS, " ").replace(/\s+/g, " ").trim();
  if (NONE.test(core) || NONE.test(text)) return exact(0);

  const range = /^(\S+)\s*(?:-|to|se|ya|or|\/)\s*(\S+)$/.exec(core);
  if (range) {
    const low = wholeNumber(range[1]!);
    const high = wholeNumber(range[2]!);
    if (low !== undefined && high !== undefined && high > low && high <= MAX_REVISIONS) {
      return inferred(high, `A deed needs one number, so this reads as ${high}, the higher one you said.`);
    }
  }
  const clause = lastClause(core);
  const n = wholeNumber(core) ?? (clause ? wholeNumber(stripFiller(clause)) : undefined);
  if (n === undefined) return failed(COUNT_UNREADABLE);
  if (n > MAX_REVISIONS) return inferred(n, `${n} revisions is a lot to promise. Sure?`);
  return exact(n);
}
