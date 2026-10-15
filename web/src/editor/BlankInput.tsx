import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { blankDef, displayValue } from "../deed/blanks";
import { IDLE_MS, isBurst } from "./dictation";
import { useEditor } from "./EditorContext";
import { heardDiffers } from "./state";

let measureContext: CanvasRenderingContext2D | null = null;

/**
 * Built from longhands: the deed's old-style figures make the `font` shorthand unrepresentable, and Chromium
 * then reports it as "", which the canvas ignores and measures at 10px sans-serif.
 */
function canvasFont(style: CSSStyleDeclaration): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

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
/** Wispr ends a dictation with a full stop; set inside the deed's sentence it would double the deed's own punctuation. */
function withoutClosingStop(raw: string): string {
  return raw.replace(/[\s.।!?]+$/u, "");
}

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
    const measured = textWidth(shown || def.placeholder, canvasFont(getComputedStyle(input)));
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

  /** Words in the blank that haven't been read yet. Words the idle pause already read aren't read (and logged) twice. */
  const unread = (): string | null => (text !== null && text !== display && text !== (blank?.raw ?? "") ? text : null);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const grew = raw.length - (text ?? display).length;
    setText(raw);
    window.clearTimeout(idle.current);
    if (isBurst(event.nativeEvent as InputEvent, grew, lastKeyAt.current)) read(raw, true);
    else idle.current = window.setTimeout(() => read(raw, false), IDLE_MS);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    lastKeyAt.current = Date.now();
    if (event.key === "Enter") {
      event.preventDefault();
      const pending = unread();
      if (pending !== null) read(pending, true);
      else if (text !== null && readable) {
        setText(null);
        setInked((n) => n + 1);
      }
    } else if (event.key === "Escape") {
      setText(null);
      window.clearTimeout(idle.current);
    } else if (event.key === "ArrowDown" && event.altKey) {
      event.preventDefault();
      const pending = unread();
      if (pending !== null) read(pending, true);
      dispatch({ type: "heard", key: blankKey });
    }
  }

  function onBlur() {
    window.clearTimeout(idle.current);
    const pending = unread();
    if (pending !== null) read(pending, true);
    setText(null);
    if (state.focused === blankKey) dispatch({ type: "focus", key: null });
  }

  // Changes to a field's description aren't spoken, so a blank that couldn't be read says so here.
  const announcement = (
    <span className="sr-only" aria-live="polite">
      {failed ? `${def.label}: ${blank.note ?? ""}` : ""}
    </span>
  );

  if (!editing) {
    const empty = !shown;
    return (
      <>
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
            "cursor-text rounded-xs outline-offset-2 [box-decoration-break:clone]",
            empty
              ? "italic text-ink-soft underline decoration-dotted decoration-[color-mix(in_srgb,var(--ink)_45%,transparent)] underline-offset-[0.28em] text-[0.92em]"
              : failed
                ? "text-ink underline decoration-wavy decoration-bahi underline-offset-[0.22em]"
                : "text-ink underline decoration-dotted decoration-[color-mix(in_srgb,var(--gold)_35%,transparent)] underline-offset-[0.3em] hover:decoration-[color-mix(in_srgb,var(--gold)_80%,transparent)]",
            problem && empty ? "decoration-bahi" : "",
          ].join(" ")}
        >
          <span key={inked} className={inked ? "ink-in" : undefined}>
            {empty ? def.placeholder : readable ? shown : withoutClosingStop(shown)}
          </span>
        </span>
        {announcement}
      </>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        id={ids.input}
        autoFocus
        value={shown}
        placeholder={def.placeholder}
        aria-label={def.label}
        aria-invalid={failed || !!problem || undefined}
        aria-describedby={described}
        aria-keyshortcuts={heardDiffers(blankKey, blank) ? "Alt+ArrowDown" : undefined}
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
      {announcement}
    </>
  );
}
