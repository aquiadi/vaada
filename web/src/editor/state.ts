import { formatRupees } from "../format/money";
import type { Blank, Draft } from "../lib/types";
import type { MilestoneDraft } from "../normalize";
import { milestoneBlanks, type StrikableKey } from "../deed/blanks";

export interface EditorState {
  draft: Draft;
  focused: string | null;
  /** Problems the API reported on the last attempt to send, keyed by blank. */
  problems: Record<string, string>;
  /** The plan couldn't be read, so the parts are set by hand. */
  manualParts: boolean;
  /** Bumped on every change worth saving. */
  edits: number;
}

export type EditorAction =
  | { type: "set"; key: string; blank: Blank }
  | { type: "attachDictation"; key: string; raw: string; dictationId: string }
  | { type: "strike"; key: StrikableKey }
  | { type: "restore"; key: StrikableKey }
  | { type: "applyPlan"; milestones: MilestoneDraft[] | null }
  | { type: "addPart" }
  | { type: "removePart"; i: number }
  | { type: "focus"; key: string | null }
  | { type: "problems"; problems: Record<string, string> };

export function initialState(draft: Draft): EditorState {
  const manualParts = draft.milestone_count > 0 && draft.blanks.plan?.confidence === "failed";
  return { draft, focused: null, problems: {}, manualParts, edits: 0 };
}

function withBlanks(state: EditorState, blanks: Record<string, Blank>, extra: Partial<Draft> = {}): EditorState {
  return { ...state, draft: { ...state.draft, ...extra, blanks }, edits: state.edits + 1 };
}

function planBlank(value: string | number, raw: string): Blank {
  return { raw, value, confidence: "exact", note: null, source: "plan" };
}

/** A blank the person filled is theirs; the plan only fills blanks that are empty or that it filled itself. */
function planMayWrite(existing: Blank | undefined): boolean {
  return !existing || existing.source === "plan" || (existing.value === null && !existing.raw.trim());
}

function partKeys(i: number): string[] {
  return milestoneBlanks(i).map((b) => b.key);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const blanks = state.draft.blanks;
  switch (action.type) {
    case "set": {
      const problems = { ...state.problems };
      delete problems[action.key];
      return { ...withBlanks(state, { ...blanks, [action.key]: action.blank }), problems };
    }
    case "attachDictation": {
      const current = blanks[action.key];
      if (!current || current.raw !== action.raw) return state;
      return { ...state, draft: { ...state.draft, blanks: { ...blanks, [action.key]: { ...current, dictationId: action.dictationId } } } };
    }
    case "strike":
      return withBlanks(state, blanks, { struck: [...new Set([...state.draft.struck, action.key])].sort() });
    case "restore":
      return withBlanks(state, blanks, { struck: state.draft.struck.filter((k) => k !== action.key) });
    case "applyPlan": {
      if (action.milestones === null) {
        return { ...withBlanks(state, blanks, { milestone_count: Math.max(state.draft.milestone_count, 1) }), manualParts: true };
      }
      const next = { ...blanks };
      action.milestones.forEach((m, index) => {
        const i = index + 1;
        if (planMayWrite(next[`milestones.${i}.title`])) next[`milestones.${i}.title`] = planBlank(m.title, m.title);
        if (planMayWrite(next[`milestones.${i}.amount`]))
          next[`milestones.${i}.amount`] = planBlank(m.amountPaise, formatRupees(m.amountPaise));
      });
      for (let i = action.milestones.length + 1; i <= state.draft.milestone_count; i++) {
        for (const key of partKeys(i)) delete next[key];
      }
      return { ...withBlanks(state, next, { milestone_count: action.milestones.length }), manualParts: false };
    }
    case "addPart":
      return { ...withBlanks(state, blanks, { milestone_count: state.draft.milestone_count + 1 }), manualParts: true };
    case "removePart": {
      const count = state.draft.milestone_count;
      if (count <= 1) return state;
      const next = { ...blanks };
      for (let i = action.i; i <= count; i++) {
        const from = partKeys(i + 1);
        partKeys(i).forEach((key, n) => {
          const moved = next[from[n]!];
          if (moved && i + 1 <= count) next[key] = moved;
          else delete next[key];
        });
      }
      return { ...withBlanks(state, next, { milestone_count: count - 1 }), manualParts: true };
    }
    case "focus":
      return state.focused === action.key ? state : { ...state, focused: action.key };
    case "problems":
      return { ...state, problems: action.problems };
  }
}

/** The parts' amounts don't add up to the total: say so with the arithmetic, never fix it quietly. */
export function sumProblem(draft: Draft): string | null {
  const total = draft.blanks.total?.value;
  if (typeof total !== "number" || draft.milestone_count === 0) return null;
  const amounts: number[] = [];
  for (let i = 1; i <= draft.milestone_count; i++) {
    const value = draft.blanks[`milestones.${i}.amount`]?.value;
    if (typeof value !== "number") return null;
    amounts.push(value);
  }
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum === total) return null;
  return `The parts add up to ${formatRupees(sum)} (${amounts.map(formatRupees).join(" + ")}), but the total is ${formatRupees(total)}.`;
}
