/** How long typing has to pause before what's in a blank is read. */
export const IDLE_MS = 400;
/** Keystrokes arrive one character at a time; anything bigger with no key behind it came in one burst. */
export const KEY_GAP_MS = 80;

/** Wispr Flow (or a paste) lands text in one burst; typing arrives a key at a time. */
export function isBurst(event: InputEvent, grewBy: number, lastKeyAt: number, now: number = Date.now()): boolean {
  return (
    event.inputType === "insertFromPaste" ||
    event.inputType === "insertFromDrop" ||
    (now - lastKeyAt > KEY_GAP_MS && grewBy > 1)
  );
}
