import { createContext, useCallback, useContext, useMemo, type Dispatch, type ReactNode } from "react";
import { blankDef, normalizeBlank, type NormalizeContext } from "../deed/blanks";
import { api } from "../lib/api";
import type { Blank } from "../lib/types";
import type { Normalized, PlanValue } from "../normalize";
import { plan } from "../normalize";
import type { EditorAction, EditorState } from "./state";

interface EditorValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Reads what landed in a blank and stores both the words and the value. */
  commit(key: string, raw: string): Normalized<unknown>;
  /** The person fixed what we made of their words: keep their value and remember the miss. */
  correct(key: string, raw: string, value: unknown): void;
  normalizeContext: NormalizeContext;
}

const EditorContext = createContext<EditorValue | null>(null);

export function useEditor(): EditorValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor outside an EditorProvider");
  return value;
}

interface Props {
  /** Null for the styleguide's specimen, which has no deal to log dictations against. */
  dealId: string | null;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  normalizeContext: NormalizeContext;
  children: ReactNode;
}

function toBlank(raw: string, result: Normalized<unknown>, source: Blank["source"] = "dictation"): Blank {
  return { raw, value: result.value, confidence: result.confidence, note: result.note ?? null, source };
}

export function EditorProvider({ dealId, state, dispatch, normalizeContext, children }: Props) {
  const logDictation = useCallback(
    (key: string, kind: string, raw: string, result: Normalized<unknown>) => {
      if (!dealId) return;
      api
        .post<{ id: string }>(`/deals/${dealId}/dictations`, { field: key, kind, raw, value: result.value, confidence: result.confidence })
        .then(({ id }) => dispatch({ type: "attachDictation", key, raw, dictationId: id }))
        .catch((error: unknown) => console.warn("dictation not logged", key, error));
    },
    [dealId, dispatch],
  );

  const syncPlan = useCallback(
    (planRaw: string | undefined, totalPaise: number | null) => {
      if (!planRaw?.trim()) return;
      const result = plan(planRaw, { totalPaise });
      dispatch({ type: "set", key: "plan", blank: toBlank(planRaw, result) });
      const milestones = (result.value as PlanValue | null)?.milestones ?? null;
      if (milestones) dispatch({ type: "applyPlan", milestones });
      else if (result.confidence === "failed") dispatch({ type: "applyPlan", milestones: null });
    },
    [dispatch],
  );

  const commit = useCallback(
    (key: string, raw: string): Normalized<unknown> => {
      const def = blankDef(key);
      const totalValue = state.draft.blanks.total?.value;
      const context = { ...normalizeContext, totalPaise: typeof totalValue === "number" ? totalValue : null };
      if (!raw.trim()) {
        dispatch({ type: "set", key, blank: { raw: "", value: null, confidence: null, note: null } });
        return { value: null, confidence: "failed", note: "" };
      }
      const result = normalizeBlank(def.kind, raw, context);
      if (key === "plan") {
        syncPlan(raw, context.totalPaise);
      } else {
        dispatch({ type: "set", key, blank: toBlank(raw, result) });
        if (key === "total" && typeof result.value === "number") syncPlan(state.draft.blanks.plan?.raw, result.value);
      }
      logDictation(key, def.kind, raw, result);
      return result;
    },
    [dispatch, logDictation, normalizeContext, state.draft.blanks, syncPlan],
  );

  const correct = useCallback(
    (key: string, raw: string, value: unknown) => {
      const previous = state.draft.blanks[key];
      dispatch({ type: "set", key, blank: { raw, value, confidence: "exact", note: null, source: "dictation", dictationId: previous?.dictationId ?? null } });
      if (previous?.dictationId) {
        api.post(`/dictations/${previous.dictationId}/corrected`, { value }).catch((error: unknown) => console.warn("correction not saved", error));
      }
    },
    [dispatch, state.draft.blanks],
  );

  const value = useMemo(
    () => ({ state, dispatch, commit, correct, normalizeContext }),
    [state, dispatch, commit, correct, normalizeContext],
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
