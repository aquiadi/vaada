import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useReducer, useState } from "react";
import { Notice } from "../components/ui";
import { DeedSheet, deedNumber } from "../design/DeedSheet";
import { Struck } from "../design/Strike";
import { clauseOf, requiredBlanks } from "../deed/blanks";
import { DeedBody, DeedDisclaimers, Para, type DeedFacts, type DeedSlots } from "../deed/DeedText";
import { PublishedDeed } from "../deed/PublishedDeed";
import { summaryText } from "../deed/summary";
import { processingFeePaise } from "../format/money";
import { fromIsoDate } from "../normalize/calendar";
import type { AppConfig } from "../lib/config";
import type { Draft, Room } from "../lib/types";
import { blankIds, BlankInput } from "./BlankInput";
import { EditorProvider, useEditor } from "./EditorContext";
import { Margin, StrikeToggle } from "./Margin";
import { SendPanel, SentPanel } from "./SendPanel";
import { editorReducer, initialState, sumProblem } from "./state";
import { useAutosave } from "./useAutosave";

const savedAt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });

const FOOT_BUTTON =
  "smallcaps mb-2 cursor-pointer border-0 bg-transparent p-0 text-micro text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink";

/**
 * Beside the parts, the part buttons stay out of the Tab sequence, so Tab walks only the blanks and a dictation
 * never lands on a button; the same buttons sit in the Tab order at the foot of the deed.
 */
function RemovePart({ i, inline = false }: { i: number; inline?: boolean }) {
  const { state, dispatch } = useEditor();
  if (!state.manualParts || state.draft.milestone_count <= 1) return null;
  return (
    <button
      type="button"
      tabIndex={inline ? -1 : undefined}
      onClick={() => dispatch({ type: "removePart", i })}
      className={inline ? "smallcaps ml-2 cursor-pointer border-0 bg-transparent p-0 align-baseline text-micro text-ink-soft underline decoration-dotted" : FOOT_BUTTON}
    >
      Remove part {i}
    </button>
  );
}

function AddPart({ inline = false }: { inline?: boolean }) {
  const { state, dispatch } = useEditor();
  if (!state.manualParts) return null;
  const button = (
    <button
      type="button"
      tabIndex={inline ? -1 : undefined}
      onClick={() => dispatch({ type: "addPart" })}
      className={
        inline
          ? "smallcaps cursor-pointer border border-dashed border-[color-mix(in_srgb,var(--ink)_40%,transparent)] bg-transparent px-3 py-1 text-ui text-ink"
          : FOOT_BUTTON
      }
    >
      Add a part
    </button>
  );
  return inline ? <Para>{button}</Para> : button;
}

/** The editing controls repeated in the Tab order after the last blank: optional clauses, and parts set by hand. */
function FootControls() {
  const { state } = useEditor();
  const parts = Array.from({ length: state.draft.milestone_count }, (_, i) => i + 1);
  return (
    <div className="no-print mt-6 flex flex-wrap gap-x-12 gap-y-4 border-t hairline pt-4">
      <fieldset className="m-0 border-0 p-0">
        <legend className="label mb-2">Optional clauses</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <StrikeToggle clause="client_organisation" />
          <StrikeToggle clause="ip_transfer" />
          <StrikeToggle clause="late_fee" />
          <StrikeToggle clause="kill_fee" />
        </div>
      </fieldset>
      {state.manualParts ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="label mb-2">Parts of the payment</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <AddPart />
            {parts.map((i) => (
              <RemovePart key={i} i={i} />
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function EditSheet({ deedNo, facts }: { deedNo: number; facts: DeedFacts }) {
  const { state } = useEditor();
  const struck = state.draft.struck;
  const slots: DeedSlots = {
    struck,
    milestoneCount: state.draft.milestone_count,
    blank: (key) => {
      const clause = clauseOf(key);
      if (clause && struck.includes(clause)) return <span aria-hidden="true">________</span>;
      return <BlankInput key={key} blankKey={key} />;
    },
    clause: (key, children) =>
      struck.includes(key) ? (
        <Struck seed={`${deedNo}-${key}`} animate>
          {children}
        </Struck>
      ) : (
        children
      ),
    margin: (keys) => <Margin keys={keys} />,
    milestoneControls: (i) => <RemovePart i={i} inline />,
    afterMilestones: <AddPart inline />,
  };
  const b = state.draft.blanks;
  const valueOf = (key: string) => (b[key]?.confidence !== "failed" ? b[key]?.value : null);
  const lastDue = valueOf(`milestones.${state.draft.milestone_count}.due`);
  const summary = summaryText({
    maker: (valueOf("maker_name") as string) ?? null,
    client: (valueOf("client_name") as string) ?? null,
    organisation: struck.includes("client_organisation") ? null : ((valueOf("client_organisation") as string) ?? null),
    work: (valueOf("work") as string) ?? null,
    totalPaise: (valueOf("total") as number) ?? null,
    parts: state.draft.milestone_count,
    lastDue: typeof lastDue === "string" ? lastDue : null,
    reviewDays: facts.reviewDays,
    bufferHours: facts.bufferHours,
  });

  return (
    <DeedSheet deedNo={deedNo}>
      <p className="label m-0 mb-1">In short</p>
      <p className="measure m-0 mb-6 text-body italic text-ink-soft" aria-live="polite">
        {summary}
      </p>
      <hr className="rule-double mb-6" />
      <DeedBody s={slots} facts={facts} />
      <hr className="rule-double my-6" />
      <DeedDisclaimers />
      <FootControls />
    </DeedSheet>
  );
}

function SentDeed({ room }: { room: Room }) {
  if (!room.agreement || !room.agreement_hash) {
    return <Notice tone="error">The deed went out, but its frozen text couldn’t be shown here. Open the deal room to read it.</Notice>;
  }
  return (
    <PublishedDeed
      agreement={room.agreement}
      hash={room.agreement_hash}
      struck={room.struck_clauses}
      accepted={room.accepted}
      registry={room.registry}
    />
  );
}

interface Props {
  room: Room;
  config: AppConfig;
}

export function DeedEditor({ room, config }: Props) {
  const [state, dispatch] = useReducer(editorReducer, room.draft as Draft, initialState);
  const [sent, setSent] = useState<Room | null>(null);
  const queries = useQueryClient();
  const { status: save, flush } = useAutosave(room.id, state.draft, state.edits, room.draft_version);
  const normalizeContext = useMemo(
    () => ({ today: fromIsoDate(config.today), maxDays: config.limits.max_deal_days, totalPaise: null }),
    [config.today, config.limits.max_deal_days],
  );
  const total = state.draft.blanks.total?.value;
  const totalPaise = typeof total === "number" && state.draft.blanks.total?.confidence !== "failed" ? total : null;
  const facts: DeedFacts = {
    madeOn: config.today,
    totalPaise,
    clientFeePaise: totalPaise === null ? null : processingFeePaise(totalPaise, config.fees.client_fee_bps),
    reviewDays: config.limits.review_window_days,
    bufferHours: config.limits.hold_buffer_hours,
    graceDays: config.limits.grace_days,
  };
  const missing = requiredBlanks(state.draft.milestone_count, state.draft.struck).filter((key) => {
    const blank = state.draft.blanks[key];
    return !blank || blank.value === null || blank.value === undefined || blank.confidence === "failed";
  });
  const ready = missing.length === 0 && !sumProblem(state.draft) && state.draft.milestone_count > 0;

  function showProblems(problems: Record<string, string>) {
    dispatch({ type: "problems", problems });
    const first = Object.keys(problems)[0];
    if (first) document.getElementById(blankIds(first).input)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function onSent(published: Room) {
    setSent(published);
    queries.setQueryData(["room", published.id], published);
    void queries.invalidateQueries({ queryKey: ["deals"] });
  }

  return (
    <EditorProvider dealId={room.id} state={state} dispatch={dispatch} normalizeContext={normalizeContext}>
      <title>{`Deed No. ${deedNumber(room.deed_no)} · ${sent ? "Sent" : "New deed"} · Vaada`}</title>
      <div className="mx-auto max-w-[76rem] px-2 py-6 sm:px-6 sm:py-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-2">
          <h1 className="label m-0">{sent ? "A deed, sent" : "A new deed"}</h1>
          {sent ? null : (
            <p className="m-0 text-micro text-ink-soft" role="status" aria-live="polite">
              {save.kind === "saving"
                ? "Saving…"
                : save.kind === "saved"
                  ? `Draft saved ${savedAt.format(save.at)} IST`
                  : save.kind === "error"
                    ? save.message
                    : "Drafts save as you go"}
            </p>
          )}
        </div>
        {sent ? <SentDeed room={sent} /> : <EditSheet deedNo={room.deed_no} facts={facts} />}
        <div className="px-2">
          {sent ? (
            <SentPanel room={sent} />
          ) : (
            <SendPanel dealId={room.id} saveFirst={flush} ready={ready} onProblems={showProblems} onSent={onSent} />
          )}
        </div>
      </div>
    </EditorProvider>
  );
}
