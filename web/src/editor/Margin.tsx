import * as Popover from "@radix-ui/react-popover";
import { useRef, useState, type FormEvent } from "react";
import { blankDef, clauseOf, displayValue, normalizeBlank, requiredBlanks, type StrikableKey } from "../deed/blanks";
import { flowHint } from "../lib/platform";
import { blankIds } from "./BlankInput";
import { useEditor } from "./EditorContext";
import { heardDiffers, sumProblem } from "./state";

function shortLabel(key: string): string {
  const label = blankDef(key).label;
  return label.replace(/^Your name, the Maker$/, "Your name").replace(/^Part (\d+): /, "Part $1, ");
}

/** The key that opens the "heard" correction from a focused blank; Mac keyboards call Alt "Option". */
function heardKey(): string {
  return /Mac/i.test(navigator.platform) ? "Option+↓" : "Alt+↓";
}

/** Mounted afresh each time the correction opens, so it always starts from what the blank says now. */
function HeardForm({ blankKey }: { blankKey: string }) {
  const { state, dispatch, correct, normalizeContext } = useEditor();
  const blank = state.draft.blanks[blankKey]!;
  const def = blankDef(blankKey);
  const shown = displayValue(def.kind, blank.value);
  const [raw, setRaw] = useState(blank.raw);
  const [written, setWritten] = useState(shown);
  const [error, setError] = useState<string | null>(null);

  function save(event: FormEvent) {
    event.preventDefault();
    const chosen = normalizeBlank(def.kind, written !== shown ? written : raw, normalizeContext);
    if (chosen.confidence === "failed" || chosen.value === null) {
      setError(chosen.note ?? "That doesn't read as a value for this blank.");
      return;
    }
    correct(blankKey, raw, chosen.value);
    dispatch({ type: "heard", key: null });
  }

  return (
    <form onSubmit={save}>
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
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `heard-error-${blankKey}` : undefined}
        className="w-full border-0 border-b border-[color-mix(in_srgb,var(--ink)_35%,transparent)] bg-transparent py-1 font-serif text-ink focus:border-bahi"
      />
      {error ? (
        <p id={`heard-error-${blankKey}`} role="alert" className="m-0 mt-2 border-l-2 border-bahi pl-2 text-ink">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-3">
        <Popover.Close type="button" className="smallcaps cursor-pointer border-0 bg-transparent text-micro text-ink-soft">
          Cancel
        </Popover.Close>
        <button type="submit" className="smallcaps cursor-pointer border border-ink bg-ink px-2 py-1 text-micro text-paper">
          Keep this
        </button>
      </div>
    </form>
  );
}

/** Click the words that were heard, or press Alt+Down in the blank, to fix either the words or what we made of them. */
function HeardEditor({ blankKey }: { blankKey: string }) {
  const { state, dispatch } = useEditor();
  const blank = state.draft.blanks[blankKey]!;
  const def = blankDef(blankKey);
  const clickedAway = useRef(false);

  return (
    <Popover.Root open={state.heard === blankKey} onOpenChange={(next) => dispatch({ type: "heard", key: next ? blankKey : null })}>
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
        <Popover.Content
          side="left"
          align="start"
          sideOffset={8}
          aria-label={`What was heard for ${def.label}`}
          className="sheet z-40 w-72 rounded-sm p-4 text-note"
          onInteractOutside={() => {
            clickedAway.current = true;
          }}
          onCloseAutoFocus={(event) => {
            // The trigger sits outside the Tab order, so the keyboard goes back to the blank instead.
            event.preventDefault();
            if (!clickedAway.current) document.getElementById(blankIds(blankKey).input)?.focus();
            clickedAway.current = false;
          }}
        >
          <HeardForm blankKey={blankKey} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Note({ blankKey }: { blankKey: string }) {
  const { state } = useEditor();
  const blank = state.draft.blanks[blankKey];
  const ids = blankIds(blankKey);
  const focused = state.focused === blankKey;
  const problem = state.problems[blankKey];
  const required = requiredBlanks(state.draft.milestone_count, state.draft.struck).includes(blankKey);
  const sum = blankKey === "plan" ? sumProblem(state.draft) : null;
  const hasRaw = !!blank?.raw.trim();
  const failed = blank?.confidence === "failed" && hasRaw;
  const readable = !!blank && !failed && blank.value !== null && blank.value !== undefined;
  const heard = heardDiffers(blankKey, blank);

  const inferred = readable && blank.confidence === "inferred" && !!blank.note;
  const toFill = !focused && !hasRaw && !problem && required;
  if (!focused && !heard && !inferred && !failed && !problem && !sum && !toFill) return null;
  return (
    <div className="mb-3 border-l border-bahi pl-2 text-note leading-snug">
      <p className="label m-0 text-[0.625rem]">{shortLabel(blankKey)}</p>
      {focused ? (
        <p id={ids.hint} className="m-0 text-ink-soft">
          {flowHint()}
          <span className="block text-micro">or type it</span>
          {heard ? <span className="block text-micro pointer-coarse:hidden">{heardKey()} fixes what was heard</span> : null}
        </p>
      ) : null}
      {heard ? <HeardEditor blankKey={blankKey} /> : null}
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
        <p id={ids.note} className="m-0 text-ink">
          {blank.note}
        </p>
      ) : null}
      {problem && !failed ? (
        <p id={ids.note} className="m-0 text-ink">
          {problem}
        </p>
      ) : null}
      {sum ? <p className="m-0 text-ink">{sum}</p> : null}
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
      className="no-print smallcaps mb-2 cursor-pointer border-0 bg-transparent p-0 text-micro text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink"
    >
      {struck ? `Restore ${CLAUSE_LABEL[clause]}` : `Strike ${CLAUSE_LABEL[clause]}`}
    </button>
  );
}

export function Margin({ keys }: { keys: string[] }) {
  const { state } = useEditor();
  const clauses = [...new Set(keys.map(clauseOf).filter((c) => c !== null))];
  return (
    <div className="md:pt-1">
      {clauses.map((c) => (
        <StrikeToggle key={c} clause={c} inMargin />
      ))}
      {keys
        .filter((k) => {
          const clause = clauseOf(k);
          return !clause || !state.draft.struck.includes(clause);
        })
        .map((k) => (
          <Note key={k} blankKey={k} />
        ))}
    </div>
  );
}
