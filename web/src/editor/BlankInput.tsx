import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { blankDef, displayValue } from "../deed/blanks";
import { useEditor } from "./EditorContext";

const IDLE_MS = 400;
/** Keystrokes arrive one character at a time; anything bigger with no key behind it came in one burst. */
const KEY_GAP_MS = 80;

let measureContext: CanvasRenderingContext2D | null = null;

function textWidth(text: string, font: string): number {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 9;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

export function blankIds(key: string) {
  const safe = key.replace(/\./g, "-");
  return { input: `blank-${safe}`, note: `note-${safe}`, hint: `hint-${safe}` };
}

/**
 * A blank in the deed. At rest it is set in the deed's serif like the words around it, so a filled deed reads
 * as one document. Focused, it is a real input. A Wispr Flow paste is read at once; hand typing is read after
 * a short pause and shown in the margin, and the blank takes the clean value when you move on.
 */
export function BlankInput({ blankKey }: { blankKey: string }) {
  const def = blankDef(blankKey);
  const { state, dispatch, commit } = useEditor();
  const blank = state.draft.blanks[blankKey];
  const editing = state.focused === blankKey;
  const [text, setText] = useState<string | null>(null);
  const [inked, setInked] = useState(0);
  const lastKeyAt = useRef(0);
  const idle = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const ids = blankIds(blankKey);

  const readable = blank && blank.confidence !== "failed" && blank.value !== null && blank.value !== undefined;
  const display = readable ? displayValue(def.kind, blank.value) : (blank?.raw ?? "");
  const shown = text ?? display;
  const failed = blank?.confidence === "failed" && !!blank.raw;
  const problem = state.problems[blankKey];
  const described = [failed || problem ? ids.note : null, editing ? ids.hint : null].filter(Boolean).join(" ") || undefined;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const font = getComputedStyle(input).font;
    const measured = textWidth(shown || def.placeholder, font);
    setWidth(Math.ceil(measured + 18));
  }, [shown, def.placeholder, editing]);

  function read(raw: string, settle: boolean) {
    window.clearTimeout(idle.current);
    const result = commit(blankKey, raw);
    if (settle && result.confidence !== "failed") {
      setText(null);
      setInked((n) => n + 1);
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const native = event.nativeEvent as InputEvent;
    const grew = raw.length - (text ?? display).length;
    const burst =
      native.inputType === "insertFromPaste" ||
      native.inputType === "insertFromDrop" ||
      (Date.now() - lastKeyAt.current > KEY_GAP_MS && grew > 1);
    setText(raw);
    window.clearTimeout(idle.current);
    if (burst) read(raw, true);
    else idle.current = window.setTimeout(() => read(raw, false), IDLE_MS);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    lastKeyAt.current = Date.now();
    if (event.key === "Enter") {
      event.preventDefault();
      if (text !== null) read(text, true);
    } else if (event.key === "Escape") {
      setText(null);
      window.clearTimeout(idle.current);
    }
  }

  function onBlur() {
    window.clearTimeout(idle.current);
    if (text !== null && text !== display) read(text, true);
    setText(null);
    if (state.focused === blankKey) dispatch({ type: "focus", key: null });
  }

  if (!editing) {
    const empty = !shown;
    return (
      <span
        role="textbox"
        tabIndex={0}
        id={ids.input}
        aria-label={def.label}
        aria-invalid={failed || !!problem || undefined}
        aria-describedby={failed || problem ? ids.note : undefined}
        data-blank={blankKey}
        onFocus={() => dispatch({ type: "focus", key: blankKey })}
        onMouseDown={(e) => {
          e.preventDefault();
          dispatch({ type: "focus", key: blankKey });
        }}
        className={[
          "cursor-text rounded-xs px-0.5 outline-offset-2 [box-decoration-break:clone]",
          empty
            ? "italic text-ink-soft underline decoration-dotted decoration-[color-mix(in_srgb,var(--ink)_45%,transparent)] underline-offset-[0.28em] text-[0.92em]"
            : failed
              ? "text-ink underline decoration-wavy decoration-bahi underline-offset-[0.22em]"
              : "text-ink underline decoration-dotted decoration-[color-mix(in_srgb,var(--gold)_70%,transparent)] underline-offset-[0.3em]",
          problem && empty ? "decoration-bahi" : "",
        ].join(" ")}
      >
        <span key={inked} className={inked ? "ink-in" : undefined}>
          {empty ? def.placeholder : shown}
        </span>
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      id={ids.input}
      autoFocus
      value={shown}
      placeholder={def.placeholder}
      aria-label={def.label}
      aria-invalid={failed || !!problem || undefined}
      aria-describedby={described}
      data-blank={blankKey}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={def.kind === "work" || def.kind === "text"}
      onFocus={(e) => e.currentTarget.select()}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onPaste={() => {
        lastKeyAt.current = 0;
      }}
      style={{ width: width ? `min(100%, ${width + 24}px)` : undefined }}
      className="mx-0.5 inline-block max-w-full rounded-none border-0 border-b-2 border-bahi bg-[color-mix(in_srgb,var(--paper-deep)_55%,transparent)] px-1 py-0 align-baseline font-serif text-deed text-ink outline-2 outline-offset-2 outline-bahi transition-[width] duration-150 ease-out placeholder:italic placeholder:text-ink-soft"
    />
  );
}
