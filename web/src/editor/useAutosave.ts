import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { explain } from "../lib/errors";
import type { Draft } from "../lib/types";

export type SaveStatus = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string };

const DELAY_MS = 900;

export class DraftNotSaved extends Error {}

/**
 * Saves the draft a moment after the person stops changing it. Saves run one after another so each carries the
 * version the previous one returned; a version conflict from another tab is reported, never overwritten.
 * flush() saves anything outstanding right away, because publishing freezes whatever the server holds.
 */
export function useAutosave(dealId: string, draft: Draft, edits: number, initialVersion: number) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const version = useRef(initialVersion);
  const latest = useRef(draft);
  const latestEdits = useRef(edits);
  const savedEdits = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useLayoutEffect(() => {
    latest.current = draft;
    latestEdits.current = edits;
  }, [draft, edits]);

  const enqueueSave = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const editsInThisSave = latestEdits.current;
      if (savedEdits.current >= editsInThisSave) return;
      setStatus({ kind: "saving" });
      try {
        const saved = await api.patch<{ draft_version: number }>(`/deals/${dealId}`, { draft: latest.current, version: version.current });
        version.current = saved.draft_version;
        savedEdits.current = editsInThisSave;
        setStatus({ kind: "saved", at: new Date() });
      } catch (error) {
        setStatus({ kind: "error", message: explain(error, "Couldn't save just now. Your words are still here.") });
      }
    });
    return queue.current;
  }, [dealId]);

  useEffect(() => {
    if (edits === 0) return;
    const timer = window.setTimeout(enqueueSave, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [edits, enqueueSave]);

  useEffect(() => () => void enqueueSave(), [enqueueSave]);

  const flush = useCallback(async () => {
    await enqueueSave();
    if (savedEdits.current < latestEdits.current) throw new DraftNotSaved("The latest changes haven't saved yet.");
  }, [enqueueSave]);

  return { status, flush };
}
