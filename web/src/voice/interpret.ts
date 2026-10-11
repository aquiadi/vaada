import { formatCalendarDate, ordinal } from "../format/dates";
import { fromRoman, toRoman } from "../format/roman";
import { addDays, type CalendarDate, compareDates, daysBetween, fromIsoDate, toIsoDate } from "../normalize/calendar";
import { date, DATE_UNREADABLE, dateLimitNote } from "../normalize/date";
import { findFestival } from "../normalize/festivals";
import { smallNumber, wholeNumber } from "../normalize/numbers";
import { stripFiller, toParseable } from "../normalize/prep";

/** Exactly what the API accepts (api/vaada/voice.py). Nothing else goes over the wire. */
export type ProposedAction =
  | { type: "mark_delivered"; milestone_idx: number | null; note: string }
  | { type: "log_revision"; milestone_idx: number | null; note: string }
  | { type: "delay"; milestone_idx: number | null; new_date: string | null; note: string }
  | { type: "note"; text: string };

export interface MilestoneContext {
  idx: number;
  title: string;
  status: string;
  /** The due day in India, as YYYY-MM-DD. Lets "do din late" become a date. */
  due?: string;
}

export interface InterpretContext {
  milestones: MilestoneContext[];
  revisionsAllowed: number | "unlimited" | null;
  revisionsLogged: number;
  today: CalendarDate;
  maxDays: number;
  /** Only the maker can mark work delivered; when the client says it, it is a note. */
  viewer?: "maker" | "client";
}

export interface Proposal {
  action: ProposedAction;
  /** The milestones it could mean when the words don't settle it. The person picks one. */
  candidates?: number[];
  /** For the margin, in red: the deed doesn't cover this. */
  warning?: string;
  /** How something was read, said quietly under the slip. */
  remark?: string;
  /** Which revision this would be, counting the ones already logged. */
  revisionNumber?: number;
  /** A delay said as a length ("do din late"): the date follows from the milestone picked. */
  shiftDays?: number;
}

interface Clause {
  start: number;
  end: number;
  /** Lowercased, single-spaced, fillers off: what the rules read. */
  words: string;
}

interface Working extends Proposal {
  from: number;
  to: number;
}

const SEPARATOR = new RegExp(
  [
    String.raw`,(?!\d)`,
    String.raw`[;!?।\n]+`,
    String.raw`(?<!\bno)\.(?=\s|$)`,
    String.raw`\s(?:lekin|magar|but|however)\s`,
    // "thoda aur", "do din aur" and "aur time" are one thought, not two.
    String.raw`(?<!\b(?:thoda|thodi|thode|kuch|ek|zara|jara|din|dino|days?|hafte|hafta|weeks?))\s(?:aur|and)\s(?!(?:time|samay|waqt|zyada|jyada|bhi)\b)`,
    String.raw`\s(?:phir|fir)\s(?!se\b)`,
    String.raw`\s(?:then|plus)\s`,
  ].join("|"),
  "giu",
);
const LEADING_CONNECTIVE = /^(?:aur|and|phir|fir|then|plus|also|lekin|magar|but)\s+/i;

/** Talk about money, calls and the client's side of things is never a delivery or a revision. */
const NOT_ABOUT_THE_WORK =
  /\b(?:payments?|pay|paid|paisa|paise|money|amount|invoice|refunds?|transfer\w*|settlement|release\w*|approv\w*|call|phone|meeting|baat|jaldi|pata|pooch\w*|puchh\w*|know|shuru|start\w*)\b/;
const DELAY =
  /\b(?:late|der (?:se|ho|hogi|hoga|lag\w*)|delay\w*|aage(?! (?:ka|ki|ke|wala|wali|wale)\b)|postpone\w*|push(?:ed|ing)?|extend\w*|extension|reschedul\w*|slip(?:s|ping|ped)?|more time|(?:time|waqt|samay) chahiye|(?:din|hafte|hafta|time|waqt|samay) (?:aur )?lag\w*|(?:din|dino|days?|hafte|hafta|weeks?) (?:aur |extra |more )?(?:chahiye|needed)|(?:more|extra) (?:days?|weeks?)|need (?:till|until))\b/;
const DELIVERED =
  /\b(?:ho (?:gaya|gayi|gaye|gai|gya|chuka|chuki|chuke)|hogaya|hogayi|bhej (?:diya|diye|di|dia|chuka|chuki|chuke)|bheja|bheji|bheje|daal (?:diya|diye|di|dia)|dal (?:diya|diye|di|dia)|upload(?:ed| kar (?:diya|diye|di|dia))|deliver(?:ed| kar (?:diya|diye|di|dia))|submit(?:ted| kar (?:diya|diye|di|dia))|share(?:d| kar (?:diya|diye|di|dia))|done|completed?|finished|khatam|sent|handed over|wrapped up)\b/;
const NOT_YET =
  /\b(?:almost|nearly|lagbhag|kareeb|half|aadha|partly|partially|not|nahi|nahin|nai|baaki|will|going to|karna|karni|karunga|karungi|karenge|karega|karegi|hoga|hogi|honge|jayega|jayegi|jayenge|jaega|jaegi)\b/;
const NOT_FINAL = /\b(?:(?<!final )drafts?|preview|wip|progress|sneak peek|rough|feedback|comments)\b/;
const CHANGE_ASKED =
  /\b(?:badlo|badal (?:do|dena|dijiye|de)|badalna|badalni|badalne|change (?:karo|kar do|kardo|karna|karni|karne|kijiye|karein)|changes? chahiye|revisions?|revise|redo|rework|tweak\w*|thod[aie] aur|aur thod[aie]|another round|ek aur round|one more round|maang\w*)\b/;
const ASKED =
  /\b(?:karo|kar do|kardo|kar dena|kar dijiye|kijiye|karein|kariye|karna hai|karni hai|karne hain|karne hai|chahiye|make it|make the|needs? to be|should be|wants?|asked for|asked to)\b/;
const CHANGE_NOUN = /\b(?:changes?|revisions?|edits?|corrections?|tweaks?)\b/;
const DONE =
  /\b(?:kar (?:diya|diye|di|dia|liya|liye|li)|ho (?:gaya|gaye|gayi|gai)|done|fixed|updated|bhej (?:diya|diye|di|dia)|implemented|incorporated|made)\b/;

type Kind = "deliver" | "revision" | "delay" | "reported" | "plain";

function kindOf(words: string): Kind {
  if (NOT_ABOUT_THE_WORK.test(words)) return "plain";
  if (DELAY.test(words)) return "delay";
  if (CHANGE_NOUN.test(words) && DONE.test(words)) return "reported";
  if (DELIVERED.test(words) && !NOT_YET.test(words) && !NOT_FINAL.test(words)) return "deliver";
  if (CHANGE_ASKED.test(words) || ASKED.test(words)) return "revision";
  return "plain";
}

const NOUN = String.raw`(?:milestones?|parts?|phases?|stages?|hissa|hisse|kist|kisht|installments?|instalments?)`;
// "milestone ek hafta aage" is a length of time, not milestone I.
const NUMBERED = new RegExp(
  String.raw`\b${NOUN}\s+(?:no\.?\s*|number\s+|num\s+|#\s*)?([0-9]{1,2}|[a-z]+)\b(?!\s+(?:din|dino|days?|hafte|hafta|weeks?|mahine|mahina|months?)\b)`,
  "g",
);
const ORDINALS: Record<string, number> = {
  pehla: 1, pahla: 1, pehle: 1, pahle: 1, pehli: 1, pahli: 1, first: 1, "1st": 1,
  doosra: 2, dusra: 2, doosre: 2, dusre: 2, doosri: 2, dusri: 2, second: 2, "2nd": 2,
  teesra: 3, tisra: 3, teesre: 3, tisre: 3, teesri: 3, tisri: 3, third: 3, "3rd": 3,
  chautha: 4, chauthe: 4, chauthi: 4, fourth: 4, "4th": 4,
  paanchva: 5, panchva: 5, paanchvan: 5, paanchve: 5, paanchvi: 5, fifth: 5, "5th": 5,
  chhatha: 6, chhathe: 6, chhathi: 6, sixth: 6, "6th": 6,
};
/** Said alone, these still mean a milestone ("doosra ho gaya"); "first" or "pehli" alone usually don't. */
const STANDALONE_ORDINALS = new Set(["pehla", "pahla", "doosra", "dusra", "teesra", "tisra", "chautha", "paanchva", "panchva", "paanchvan", "chhatha"]);
const ORDINAL = new RegExp(
  String.raw`\b(${Object.keys(ORDINALS).join("|")})\b(\s+(?:wala|wali|wale|vala|vali|one|${NOUN})\b)?`,
  "g",
);
const LAST = new RegExp(String.raw`\b(?:last|aakhri|akhri|aakhiri|final)\s+(?:wala\s+|wali\s+)?(?:${NOUN}|wala|wali|one)\b`);

/** Words that say nothing about which milestone is meant, including the ones every brief shares. */
const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "aur", "par", "wala", "wali", "milestone", "part", "phase", "stage",
  "final", "first", "second", "third", "file", "files", "work", "kaam", "delivery", "deliver", "delivered",
  "payment", "balance", "rest", "remaining", "baaki", "round", "set", "all", "version", "draft", "drafts",
  "done", "sent", "change", "changes", "revision", "revisions", "handover",
]);

interface Reference {
  /** Words to set aside when looking for a note or a date. */
  text: string;
  /** A milestone named outright: "milestone 2", "doosra", "milestone II". */
  named?: number;
  /** Milestones whose titles share a distinctive word with what was said. */
  byTitle?: number[];
  /** A number said that isn't one of this deed's milestones. */
  missing?: number;
}

function milestoneNumber(word: string): number | undefined {
  const n = /^\d{1,2}$/.test(word) ? Number(word) : /^[ivx]+$/.test(word) ? fromRoman(word) : smallNumber(word);
  return n !== undefined && n >= 1 && n <= 99 ? n : undefined;
}

function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w))
    .map(stem);
}

function findReference(words: string, milestones: MilestoneContext[]): Reference | null {
  const found = (text: string, n: number): Reference =>
    milestones.some((m) => m.idx === n) ? { text, named: n } : { text, missing: n };
  const ordinals = [...words.matchAll(ORDINAL)];
  const withNoun = ordinals.find((match) => match[2]);
  if (withNoun) return found(withNoun[0], ORDINALS[withNoun[1]!]!);
  for (const match of words.matchAll(NUMBERED)) {
    const n = milestoneNumber(match[1]!);
    if (n !== undefined) return found(match[0], n);
  }
  const alone = ordinals.find((match) => STANDALONE_ORDINALS.has(match[1]!));
  if (alone) return found(alone[0], ORDINALS[alone[1]!]!);
  const last = LAST.exec(words);
  if (last && milestones.length > 0) return { text: last[0], named: Math.max(...milestones.map((m) => m.idx)) };

  // A title word helps only if it narrows things down: "website" in two of three titles still rules one out.
  const said = new Set(words.split(/[^\p{L}\p{N}]+/u).map(stem));
  const titlesWith = new Map<string, number>();
  const distinct = milestones.map((m) => ({ idx: m.idx, words: [...new Set(titleWords(m.title))] }));
  for (const { words: titled } of distinct) {
    for (const w of titled) titlesWith.set(w, (titlesWith.get(w) ?? 0) + 1);
  }
  const scores = distinct.map(({ idx, words: titled }) => ({
    idx,
    score: titled.filter((w) => said.has(w) && (titlesWith.get(w) ?? 0) < milestones.length).length,
  }));
  const best = Math.max(0, ...scores.map((s) => s.score));
  const byTitle = scores.filter((s) => best > 0 && s.score === best).map((s) => s.idx);
  return byTitle.length > 0 ? { text: "", byTitle } : null;
}

/**
 * A milestone named outright wins. Title words are weaker evidence, so they only count among the
 * milestones this kind of action can apply to; otherwise the preferred ones decide, then the allowed ones.
 * A number the deed doesn't have always goes back to the person, even with one choice: they said something
 * else, and quietly substituting a milestone could move money they didn't mean to.
 */
function settle(ref: Reference | null, preferred: number[], allowed: number[]): { idx: number | null; candidates?: number[] } {
  if (ref?.named !== undefined) return { idx: ref.named };
  const titled = ref?.byTitle?.filter((i) => allowed.includes(i)) ?? [];
  const choices = titled.length > 0 ? titled : preferred.length > 0 ? preferred : allowed;
  if (choices.length === 1 && ref?.missing === undefined) return { idx: choices[0]! };
  return choices.length > 0 ? { idx: null, candidates: choices } : { idx: null };
}

const STATUS_PHRASE: Record<string, string> = {
  unfunded: "not paid for yet",
  delivered: "already marked delivered",
  released: "already released",
  refund_requested: "being refunded",
  refunded: "refunded",
  disputed: "in dispute",
  resolved: "settled",
  cancelled: "cancelled",
};

function statusPhrase(status: string): string {
  return STATUS_PHRASE[status] ?? "not open for this";
}

function missingRemark(ref: Reference | null): string | undefined {
  return ref?.missing !== undefined ? `There's no milestone ${toRoman(ref.missing)} in this deed.` : undefined;
}

function splitClauses(text: string, titles: string[]): Clause[] {
  const lower = text.toLowerCase();
  const kept: Array<[number, number]> = [];
  for (const title of titles) {
    const needle = title.toLowerCase().trim();
    if (!/\s/.test(needle)) continue;
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) kept.push([at, at + needle.length]);
  }
  const clauses: Clause[] = [];
  let start = 0;
  const close = (end: number) => {
    const words = stripFiller(toParseable(text.slice(start, end)).replace(/["“”‘’]/g, "").replace(LEADING_CONNECTIVE, ""));
    if (words) clauses.push({ start, end, words });
  };
  for (const match of text.matchAll(SEPARATOR)) {
    const at = match.index;
    if (kept.some(([s, e]) => at >= s && at < e)) continue;
    close(at);
    start = at + match[0].length;
  }
  close(text.length);
  return clauses;
}

function tidy(slice: string): string {
  return slice
    .trim()
    .replace(LEADING_CONNECTIVE, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const EMPTY_WORDS = new Set([
  "ka", "ki", "ke", "ko", "hai", "hain", "tha", "thi", "the", "maine", "mene", "humne", "aaj", "abhi", "kaam", "work",
  "wala", "wali", "sab", "saara", "poora", "pura", "is", "are", "was", "has", "been", "have", "i", "we", "it", "all",
  "also", "bhi", "kar", "ho", "gaya", "gayi", "diya", "di", "and", "aur", "a", "an", "to", "my", "our", "milestone",
  "part", "with", "of",
]);

/** "Milestone do ho gaya" says nothing a delivery note should repeat; "PDF Drive pe hai" does. */
function saysMore(words: string, ref: Reference | null, milestones: MilestoneContext[]): boolean {
  const titled = new Set(milestones.flatMap((m) => titleWords(m.title)));
  const rest = (ref?.text ? words.replace(ref.text, " ") : words).replace(DELIVERED, " ");
  return rest.split(/[^\p{L}\p{N}]+/u).some((w) => w.length > 1 && !EMPTY_WORDS.has(w) && !titled.has(stem(w)));
}

const DATE_WORD =
  /^(?:aaj|today|kal|tomorrow|tmrw|parson|parso|tareekh|tarikh|taarikh|din|dino|dinon|days?|hafte|hafta|haftey|weeks?|mahine|mahina|months?|month-?end|\d{1,2}(?:st|nd|rd|th)|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{4}-\d{2}-\d{2}|(?:sun|mon|tues|wednes|thurs|fri|satur)day|ravivaa?r|itwaa?r|itvaa?r|somvaa?r|mangalvaa?r|budhvaa?r|guruvaa?r|shukravaa?r|shanivaa?r|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/;
const DURATION_UNIT = /^(?:din|dino|dinon|days?|hafte|hafta|haftey|hafton|weeks?)$/;
const SHIFT_WORD = /\b(?:late|der|delay\w*|aage|extra|zyada|jyada|aur|more|push\w*|extend\w*|postpone\w*|lag\w*|slip\w*)\b/;
const LONGEST_DATE = 5;

interface DateReading {
  iso: string | null;
  remark?: string;
  shiftDays?: number;
}

function spanOf(days: number): string {
  if (days % 7 === 0) return days === 7 ? "a week" : `${days / 7} weeks`;
  return days === 1 ? "a day" : `${days} days`;
}

/** "do din late", "a week more": a length added to the due date, not counted from today. */
function shiftIn(tokens: string[], shiftImplied: boolean): number | undefined {
  if (!shiftImplied && !SHIFT_WORD.test(tokens.join(" "))) return undefined;
  for (let i = 0; i < tokens.length; i++) {
    const unit = tokens[i]!;
    if (!DURATION_UNIT.test(unit)) continue;
    if (/^(?:mein|me|main)$/.test(tokens[i + 1] ?? "") || /^(?:in|within)$/.test(tokens[i - 2] ?? "")) continue;
    // "two more days", "do aur din": the count sits one word further back.
    const before = /^(?:more|extra|aur|zyada|jyada)$/.test(tokens[i - 1] ?? "") ? tokens[i - 2] : tokens[i - 1];
    let n = before === undefined ? undefined : /^(?:a|an|one|ek)$/.test(before) ? 1 : wholeNumber(before);
    if (n === undefined && /^(?:hafta|week)$/.test(unit)) n = 1;
    if (n === undefined || n <= 0) continue;
    return /^(?:hafte|hafta|haftey|hafton|weeks?)$/.test(unit) ? n * 7 : n;
  }
  return undefined;
}

function shiftedDue(ctx: InterpretContext, idx: number, days: number): DateReading {
  const due = ctx.milestones.find((m) => m.idx === idx)?.due;
  if (!due) return { iso: null, shiftDays: days, remark: "Couldn't work out the new date. Say the day itself to move it." };
  const moved = addDays(fromIsoDate(due), days);
  const when = formatCalendarDate(moved);
  if (compareDates(moved, ctx.today) < 0) {
    return { iso: null, shiftDays: days, remark: `That works out to ${when}, which has passed. Say the new date instead.` };
  }
  if (daysBetween(ctx.today, moved) > ctx.maxDays) return { iso: null, shiftDays: days, remark: dateLimitNote(ctx.maxDays) };
  return {
    iso: toIsoDate(moved),
    shiftDays: days,
    remark: `Read this as ${spanOf(days)} after milestone ${toRoman(idx)}'s due date: ${when}.`,
  };
}

function anchored(window: string[]): boolean {
  const text = window.join(" ");
  return window.some((w) => DATE_WORD.test(w)) || /\b\d{1,2} (?:tak|ko)\b/.test(text) || findFestival(text) !== undefined;
}

/** The longest run of words that reads as a date; dates are read by the same normalizer as the deed's blanks. */
function dateIn(tokens: string[], ctx: InterpretContext): DateReading {
  let problem: string | undefined;
  for (let length = Math.min(LONGEST_DATE, tokens.length); length >= 1; length--) {
    for (let start = 0; start + length <= tokens.length; start++) {
      const window = tokens.slice(start, start + length);
      if (!anchored(window)) continue;
      const read = date(window.join(" "), { today: ctx.today, maxDays: ctx.maxDays });
      if (read.value) return read.note ? { iso: read.value, remark: read.note } : { iso: read.value };
      if (read.note && read.note !== DATE_UNREADABLE) problem ??= read.note;
    }
    // A date that was read but can't be used ("6 mahine": too far) mustn't fall back to a piece of it ("mahine").
    if (problem) return { iso: null, remark: problem };
  }
  return { iso: null };
}

function newDate(words: string, idx: number | null, ctx: InterpretContext, shiftImplied: boolean): DateReading {
  const tokens = words.split(" ").filter(Boolean);
  const shift = shiftIn(tokens, shiftImplied);
  if (shift === undefined) return dateIn(tokens, ctx);
  if (idx === null) {
    return { iso: null, shiftDays: shift, remark: "Pick the milestone, and the new date is worked out from its due date." };
  }
  return shiftedDue(ctx, idx, shift);
}

function overLimit(nth: number, allowed: number): string {
  if (allowed === 0) return `This looks like a revision, and the deed doesn't cover any.`;
  return `This looks like a ${ordinal(nth)} revision. The deed covers ${allowed}.`;
}

/**
 * Reads what someone said happened today and proposes actions. It never applies anything: each
 * proposal is shown on a slip and the person decides. Each clause yields at most one action.
 */
export function interpret(text: string, ctx: InterpretContext): Proposal[] {
  const clauses = splitClauses(text, ctx.milestones.map((m) => m.title));
  const statusOf = (idx: number) => ctx.milestones.find((m) => m.idx === idx)?.status ?? "";
  const withStatus = (...statuses: string[]) => ctx.milestones.filter((m) => statuses.includes(m.status)).map((m) => m.idx);
  const held = withStatus("held");
  const datable = withStatus("held", "unfunded");
  const deliveredNow: number[] = [];
  const out: Working[] = [];
  let previousKind: Kind | null = null;

  const slice = (from: number, to: number) => tidy(text.slice(from, to));

  const addNote = (clause: Clause, remark?: string) => {
    const previous = out[out.length - 1];
    if (!remark && previous?.action.type === "note" && !previous.remark) {
      previous.action = { type: "note", text: slice(previous.from, clause.end) };
      previous.to = clause.end;
      return;
    }
    out.push({ action: { type: "note", text: slice(clause.start, clause.end) }, from: clause.start, to: clause.end, ...(remark ? { remark } : {}) });
  };

  for (const clause of clauses) {
    let kind = kindOf(clause.words);
    if (kind === "deliver" && ctx.viewer === "client") kind = "plain";
    const ref = kind === "plain" || kind === "reported" ? null : findReference(clause.words, ctx.milestones);
    if (kind === "deliver" && previousKind === "reported" && ref?.named === undefined) kind = "reported";
    previousKind = kind;

    if (kind === "deliver") {
      const earlier = [...out].reverse().find((p) => p.action.type === "mark_delivered");
      if (earlier?.action.type === "mark_delivered" && (ref?.named === undefined || ref.named === earlier.action.milestone_idx)) {
        const piece = slice(clause.start, clause.end);
        earlier.action = { ...earlier.action, note: earlier.action.note ? `${earlier.action.note}, ${piece}` : piece };
        earlier.to = clause.end;
        continue;
      }
      if (ref?.named !== undefined && statusOf(ref.named) !== "held") {
        addNote(clause, `Milestone ${toRoman(ref.named)} is ${statusPhrase(statusOf(ref.named))}, so this goes in the register as a note.`);
        continue;
      }
      const { idx, candidates } = settle(ref, held, held);
      if (idx === null && !candidates) {
        addNote(clause, "No milestone is waiting to be marked delivered, so this goes in the register as a note.");
        continue;
      }
      if (idx !== null) deliveredNow.push(idx);
      const remark = missingRemark(ref);
      out.push({
        action: { type: "mark_delivered", milestone_idx: idx, note: saysMore(clause.words, ref, ctx.milestones) ? slice(clause.start, clause.end) : "" },
        from: clause.start,
        to: clause.end,
        ...(candidates ? { candidates } : {}),
        ...(remark ? { remark } : {}),
      });
      continue;
    }

    if (kind === "revision") {
      const open = [...new Set([...withStatus("held", "delivered", "unfunded", "disputed"), ...deliveredNow])];
      const delivered = [...new Set([...withStatus("delivered"), ...deliveredNow])];
      const { idx, candidates } = settle(ref, delivered, open);
      const previous = out[out.length - 1];
      if (
        previous?.action.type === "log_revision" &&
        previous.action.milestone_idx === idx &&
        (previous.candidates ?? []).join() === (candidates ?? []).join()
      ) {
        previous.action = { ...previous.action, note: slice(previous.from, clause.end) };
        previous.to = clause.end;
        continue;
      }
      const remark = missingRemark(ref);
      out.push({
        action: { type: "log_revision", milestone_idx: idx, note: slice(clause.start, clause.end) },
        from: clause.start,
        to: clause.end,
        ...(candidates ? { candidates } : {}),
        ...(remark ? { remark } : {}),
      });
      continue;
    }

    if (kind === "delay") {
      if (ref?.named !== undefined && !datable.includes(ref.named)) {
        const roman = toRoman(ref.named);
        addNote(clause, `Milestone ${roman} is ${statusPhrase(statusOf(ref.named))}, so its date can't move. This goes in the register as a note.`);
        continue;
      }
      const { idx, candidates } = settle(ref, datable, datable);
      if (idx === null && !candidates) {
        addNote(clause, "No milestone is still open, so this goes in the register as a note.");
        continue;
      }
      const words = ref?.text ? clause.words.replace(ref.text, " ") : clause.words;
      const when = newDate(words, idx, ctx, false);
      const remark = [missingRemark(ref), when.remark].filter(Boolean).join(" ");
      out.push({
        action: { type: "delay", milestone_idx: idx, new_date: when.iso, note: slice(clause.start, clause.end) },
        from: clause.start,
        to: clause.end,
        ...(candidates ? { candidates } : {}),
        ...(remark ? { remark } : {}),
        ...(when.shiftDays !== undefined ? { shiftDays: when.shiftDays } : {}),
      });
      continue;
    }

    // "Thoda aur time chahiye, do hafte": a bare date right after a delay belongs to it.
    const previous = out[out.length - 1];
    if (previous?.action.type === "delay" && previous.action.new_date === null && previous.shiftDays === undefined) {
      const when = newDate(clause.words, previous.action.milestone_idx, ctx, true);
      if (when.iso !== null || when.shiftDays !== undefined) {
        previous.action = { ...previous.action, new_date: when.iso, note: slice(previous.from, clause.end) };
        previous.to = clause.end;
        if (when.remark) previous.remark = when.remark;
        if (when.shiftDays !== undefined) previous.shiftDays = when.shiftDays;
        continue;
      }
    }
    addNote(clause);
  }

  let nth = ctx.revisionsLogged;
  return out.map(({ from: _from, to: _to, ...proposal }) => {
    const { action } = proposal;
    if (action.type === "note") return { ...proposal, action: { ...action, text: capitalise(action.text) } };
    const settled = { ...proposal, action: { ...action, note: capitalise(action.note) } };
    if (action.type !== "log_revision") return settled;
    nth += 1;
    const allowed = ctx.revisionsAllowed;
    return {
      ...settled,
      revisionNumber: nth,
      ...(typeof allowed === "number" && nth > allowed ? { warning: overLimit(nth, allowed) } : {}),
    };
  });
}

/** The slip as it reads once the person has said which milestone they meant. */
export function withMilestone(proposal: Proposal, idx: number, ctx: InterpretContext): Proposal {
  const { action } = proposal;
  if (action.type === "note") return proposal;
  if (action.type === "delay" && proposal.shiftDays !== undefined) {
    const moved = shiftedDue(ctx, idx, proposal.shiftDays);
    return { ...proposal, action: { ...action, milestone_idx: idx, new_date: moved.iso }, remark: moved.remark };
  }
  return { ...proposal, action: { ...action, milestone_idx: idx } };
}
