import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { blankDef, displayValue, normalizeBlank, requiredBlanks, type StrikableKey } from "../deed/blanks";
import { flowHint } from "../lib/platform";
import { blankIds } from "./BlankInput";
import { useEditor } from "./EditorContext";
import { sumProblem } from "./state";

function shortLabel(key: string): string {
  const label = blankDef(key).label;
  return label.replace(/^Your name, the Maker$/, "Your name").replace(/^Part (\d+): /, "Part $1, ");
}

/** Click the words that were heard to fix either the words or what we made of them. */
function HeardEditor({ blankKey }: { blankKey: string }) {
  const { state, correct, normalizeContext } = useEditor();
  const blank = state.draft.blanks[blankKey]!;
  const def = blankDef(blankKey);
  const [raw, setRaw] = useState(blank.raw);
  const [written, setWritten] = useState(displayValue(def.kind, blank.value));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function save() {
    const fromWritten = normalizeBlank(def.kind, written, normalizeContext);
    const fromRaw = normalizeBlank(def.kind, raw, normalizeContext);
    const writtenChanged = written !== displayValue(def.kind, blank.value);
    const chosen = writtenChanged ? fromWritten : fromRaw;
    if (chosen.confidence === "failed" || chosen.value === null) {
      setError(chosen.note ?? "That doesn't read as a value for this blank.");
      return;
    }
    correct(blankKey, raw, chosen.value);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="cursor-pointer border-0 bg-transparent p-0 text-left font-serif text-note italic text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink"
          aria-label={`Heard "${blank.raw}" for ${def.label}. Edit what was heard or what was written.`}
        >
          “{blank.raw}”
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="left" align="start" sideOffset={8} className="sheet z-40 w-72 rounded-sm p-4 text-note">
          <label className="label block" htmlFor={`heard-${blankKey}`}>
            Heard
          </label>
          <input
            id={`heard-${blankKey}`}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="mb-3 w-full border-0 border-b border-[color-mix(in_srgb,var(--ink)_35%,transparent)] bg-transparent py-1 font-serif italic text-ink focus:border-bahi"
          />
          <label className="label block" htmlFor={`written-${blankKey}`}>
            Written as
          </label>
          <input
            id={`written-${blankKey}`}
            value={written}
            onChange={(e) => setWritten(e.target.value)}
            className="w-full border-0 border-b border-[color-mix(in_srgb,var(--ink)_35%,transparent)] bg-transparent py-1 font-serif text-ink focus:border-bahi"
          />
          {error ? <p className="m-0 mt-2 text-bahi">{error}</p> : null}
          <div className="mt-3 flex justify-end gap-3">
            <Popover.Close className="smallcaps cursor-pointer border-0 bg-transparent text-micro text-ink-soft">Cancel</Popover.Close>
            <button type="button" onClick={save} className="smallcaps cursor-pointer border border-ink bg-ink px-2 py-1 text-micro text-paper">
              Keep this
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Note({ blankKey }: { blankKey: string }) {
  const { state } = useEditor();
  const blank = state.draft.blanks[blankKey];
  const def = blankDef(blankKey);
  const ids = blankIds(blankKey);
  const focused = state.focused === blankKey;
  const problem = state.problems[blankKey];
  const required = requiredBlanks(state.draft.milestone_count, state.draft.struck).includes(blankKey);
  const sum = blankKey === "plan" ? sumProblem(state.draft) : null;
  const hasRaw = !!blank?.raw.trim();
  const failed = blank?.confidence === "failed" && hasRaw;
  const readable = !!blank && !failed && blank.value !== null && blank.value !== undefined;
  const display = readable ? displayValue(def.kind, blank.value) : "";
  const heardDiffers = readable && blank.source !== "plan" && blank.raw.trim() !== display;

  const inferred = readable && blank.confidence === "inferred" && !!blank.note;
  const toFill = !focused && !hasRaw && !problem && required;
  if (!focused && !heardDiffers && !inferred && !failed && !problem && !sum && !toFill) return null;
  return (
    <div className="mb-3 border-l border-bahi pl-2 text-note leading-snug">
      <p className="label m-0 text-[0.625rem]">{shortLabel(blankKey)}</p>
      {focused ? (
        <p id={ids.hint} className="m-0 text-ink-soft">
          {flowHint()}
          <span className="block text-micro">or type it</span>
        </p>
      ) : null}
      {heardDiffers ? <HeardEditor blankKey={blankKey} /> : null}
      {inferred ? (
        <p className="m-0 text-ink-soft">
          <span className="mr-1 text-bahi" aria-hidden="true">
            †
          </span>
          <span className="sr-only">Check this: </span>
          {blank.note}
        </p>
      ) : null}
      {failed ? (
        <p id={ids.note} className="m-0 text-bahi">
          {blank.note}
        </p>
      ) : null}
      {problem && !failed ? (
        <p id={ids.note} className="m-0 text-bahi">
          {problem}
        </p>
      ) : null}
      {sum ? <p className="m-0 text-bahi">{sum}</p> : null}
      {toFill ? <p className="m-0 italic text-ink-soft">To fill in</p> : null}
    </div>
  );
}

const CLAUSE_LABEL: Record<StrikableKey, string> = {
  client_organisation: "the organisation",
  late_fee: "the late fee clause",
  kill_fee: "the kill fee clause",
  ip_transfer: "the copyright clause",
};

/**
 * In the margin it stays out of the Tab sequence, so Tab walks only the blanks and a dictation never lands on
 * a button; the same toggles sit in the tab order at the foot of the deed.
 */
export function StrikeToggle({ clause, inMargin = false }: { clause: StrikableKey; inMargin?: boolean }) {
  const { state, dispatch } = useEditor();
  const struck = state.draft.struck.includes(clause);
  return (
    <button
      type="button"
      tabIndex={inMargin ? -1 : undefined}
      onClick={() => dispatch({ type: struck ? "restore" : "strike", key: clause })}
      aria-pressed={struck}
      className="smallcaps mb-2 cursor-pointer border-0 bg-transparent p-0 text-micro text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink"
    >
      {struck ? `Restore ${CLAUSE_LABEL[clause]}` : `Strike ${CLAUSE_LABEL[clause]}`}
    </button>
  );
}

const CLAUSE_FOR_KEYS: Array<[string, StrikableKey]> = [
  ["client_organisation", "client_organisation"],
  ["late_fee.", "late_fee"],
  ["kill_fee.", "kill_fee"],
  ["ip_transfer.", "ip_transfer"],
];

export function Margin({ keys }: { keys: string[] }) {
  const { state } = useEditor();
  const clauses = [...new Set(keys.map((k) => CLAUSE_FOR_KEYS.find(([p]) => k.startsWith(p))?.[1]).filter(Boolean))] as StrikableKey[];
  return (
    <div className="md:pt-1">
      {clauses.map((c) => (
        <StrikeToggle key={c} clause={c} inMargin />
      ))}
      {keys
        .filter((k) => !clauses.some((c) => state.draft.struck.includes(c) && CLAUSE_FOR_KEYS.some(([p, cl]) => cl === c && k.startsWith(p))))
        .map((k) => (
          <Note key={k} blankKey={k} />
        ))}
    </div>
  );
}
