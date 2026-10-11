import { wholeNumber } from "./numbers";
import { lastClause, prepare, stripFiller } from "./prep";
import { exact, failed, inferred, type Normalized } from "./types";

export type RevisionCount = number | "unlimited";

export const COUNT_UNREADABLE = "Couldn't read a number here. Try 'teen' or '3'.";
export const UNLIMITED_NOTE = "Unlimited revisions is how freelancers get stuck. Sure?";
/** The API's cap on revision rounds; a bigger number would only come back as a problem at Send. */
const MAX_REVISIONS = 20;
export const TOO_MANY_REVISIONS = `A deed can promise up to ${MAX_REVISIONS} rounds of revision, or unlimited. Say a smaller number.`;

const UNLIMITED =
  /\b(unlimited|infinite|limitless|jitne chahiye|jitni chahiye|jitna chahiye|jitne bhi|koi limit nahi|koi limit nahin|no limit|as many as (needed|they want|you want|required)|bina limit|anant)\b/;
const NONE = /^(none|no revisions?|zero|koi nahi|koi nahin|kuch nahi|nil|0)$/;
const NOUNS =
  /\b(revisions?|revision tak|rounds?|round|changes?|badlav|iterations?|baar|times|tak|ka|ki|ke|of|feedback|edits?|max|maximum|upto|up to|at most|sirf|only|bas)\b/g;

const DAY_WORDS = /\b(din|dino|dinon|days?)\b/g;
const WEEK_WORDS = /\b(hafta|hafte|haftey|hafton|weeks?)\b/;

/** A small count: revisions by default, or a number of days ("paanch din", "ek hafta") for the late-fee clause. */
export function count(raw: string, opts: { unit?: "revisions" | "days" } = {}): Normalized<RevisionCount> {
  const { text } = prepare(raw);
  if (!text) return failed(COUNT_UNREADABLE);
  if (opts.unit === "days") return days(text);
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
  if (n > MAX_REVISIONS) return failed(TOO_MANY_REVISIONS);
  return exact(n);
}

function days(text: string): Normalized<RevisionCount> {
  const weeks = WEEK_WORDS.test(text);
  const core = text.replace(WEEK_WORDS, " ").replace(DAY_WORDS, " ").replace(NOUNS, " ").replace(/\s+/g, " ").trim();
  const n = core ? wholeNumber(core) : weeks ? 1 : undefined;
  if (n === undefined || n <= 0) return failed("Couldn't read a number of days. Try 'paanch din' or '5 days'.");
  const total = weeks ? n * 7 : n;
  return total > 60 ? failed("Keep this under 60 days.") : exact(total);
}
