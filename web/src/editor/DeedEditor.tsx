import { useMemo, useReducer, useState } from "react";
import { DeedSheet } from "../design/DeedSheet";
import { Struck } from "../design/Strike";
import { DeedBody, Para, type DeedFacts, type DeedSlots } from "../deed/DeedText";
import { requiredBlanks, type StrikableKey } from "../deed/blanks";
import { summaryText } from "../deed/summary";
import { fromIsoDate } from "../normalize/calendar";
import type { AppConfig } from "../lib/config";
import type { Draft, Room } from "../lib/types";
import { blankIds, BlankInput } from "./BlankInput";
import { EditorProvider, useEditor } from "./EditorContext";
import { Margin, StrikeToggle } from "./Margin";
import { SendPanel, SentPanel } from "./SendPanel";
import { editorReducer, initialState, sumProblem } from "./state";
import { useAutosave } from "./useAutosave";

const CLAUSE_PREFIX: Array<[string, StrikableKey]> = [
  ["client_organisation", "client_organisation"],
  ["late_fee.", "late_fee"],
  ["kill_fee.", "kill_fee"],
  ["ip_transfer.", "ip_transfer"],
];

function ceilBps(paise: number, bps: number): number {
  return Math.floor((paise * bps + 9999) / 10_000);
}

function PartControls({ i }: { i: number }) {
  const { state, dispatch } = useEditor();
  if (!state.manualParts || state.draft.milestone_count <= 1) return null;
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "removePart", i })}
      className="smallcaps ml-2 cursor-pointer border-0 bg-transparent p-0 align-baseline text-micro text-ink-soft underline decoration-dotted"
    >
      Remove part {i}
    </button>
  );
}

function AddPart() {
  const { state, dispatch } = useEditor();
  if (!state.manualParts) return null;
  return (
    <Para>
      <button
        type="button"
        onClick={() => dispatch({ type: "addPart" })}
        className="smallcaps cursor-pointer border border-dashed border-[color-mix(in_srgb,var(--ink)_40%,transparent)] bg-transparent px-3 py-1 text-ui text-ink"
      >
        Add a part
      </button>
    </Para>
  );
}

function EditSheet({ deedNo, facts }: { deedNo: number; facts: DeedFacts }) {
  const { state } = useEditor();
  const struck = state.draft.struck;
  const slots: DeedSlots = {
    struck,
    milestoneCount: state.draft.milestone_count,
    blank: (key) => {
      const clause = CLAUSE_PREFIX.find(([p]) => key.startsWith(p))?.[1];
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
    milestoneControls: (i) => <PartControls i={i} />,
    afterMilestones: <AddPart />,
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
      <fieldset className="m-0 border-0 p-0">
        <legend className="label mb-2">Optional clauses</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <StrikeToggle clause="client_organisation" />
          <StrikeToggle clause="ip_transfer" />
          <StrikeToggle clause="late_fee" />
          <StrikeToggle clause="kill_fee" />
        </div>
      </fieldset>
    </DeedSheet>
  );
}

interface Props {
  room: Room;
  config: AppConfig;
}

export function DeedEditor({ room, config }: Props) {
  const [state, dispatch] = useReducer(editorReducer, room.draft as Draft, initialState);
  const [sent, setSent] = useState<Room | null>(null);
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
    clientFeePaise: totalPaise === null ? null : ceilBps(totalPaise, config.fees.client_fee_bps),
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

  return (
    <EditorProvider dealId={room.id} state={state} dispatch={dispatch} normalizeContext={normalizeContext}>
      <div className="mx-auto max-w-[76rem] px-2 py-6 sm:px-6 sm:py-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-2">
          <p className="label m-0">A new deed</p>
          <p className="m-0 text-micro text-ink-soft" role="status" aria-live="polite">
            {save.kind === "saving"
              ? "Saving…"
              : save.kind === "saved"
                ? `Draft saved ${save.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : save.kind === "error"
                  ? save.message
                  : "Drafts save as you go"}
          </p>
        </div>
        <EditSheet deedNo={room.deed_no} facts={facts} />
        <div className="px-2">
          {sent ? (
            <SentPanel room={sent} />
          ) : (
            <SendPanel dealId={room.id} saveFirst={flush} ready={ready} onProblems={showProblems} onSent={setSent} />
          )}
        </div>
      </div>
    </EditorProvider>
  );
}
