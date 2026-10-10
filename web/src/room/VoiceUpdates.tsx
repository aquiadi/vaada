import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, Notice } from "../components/ui";
import { Struck } from "../design/Strike";
import { formatInstantIst, formatIsoDate, istDateOf } from "../format/dates";
import { toRoman } from "../format/roman";
import { ApiError, api } from "../lib/api";
import { useConfig } from "../lib/config";
import { flowHint } from "../lib/platform";
import type { Room } from "../lib/types";
import { daysBetween, fromIsoDate } from "../normalize/calendar";
import { type InterpretContext, interpret, type Proposal, type ProposedAction, withMilestone } from "../voice/interpret";
import { dayOf, firstName, otherParty } from "./words";

const IDLE_MS = 400;
/** Keystrokes arrive one character at a time; anything bigger with no key behind it came in one burst. */
const KEY_GAP_MS = 80;
/** The API takes at most this many actions in one update. */
const MOST_ACTIONS = 12;
const RECENT = 5;

type Decision = "apply" | "dismiss";

interface Choice {
  decision: Decision;
  milestone?: number;
}

const STATUS_WORDS: Record<string, string> = {
  applied: "Applied",
  partially_applied: "Partly applied",
  dismissed: "Dismissed",
  proposed: "Not applied",
};

function contextFor(room: Room, configLimit: number | undefined): InterpretContext | null {
  const limit = room.agreement?.policy.max_deal_days ?? configLimit;
  if (limit === undefined) return null;
  const today = fromIsoDate(istDateOf(room.now));
  const sentDaysAgo = room.published_at ? daysBetween(fromIsoDate(istDateOf(room.published_at)), today) : 0;
  return {
    milestones: room.milestones.map((m) => ({ idx: m.idx, title: m.title, status: m.status, due: istDateOf(m.due_at) })),
    revisionsAllowed: room.revisions_allowed,
    revisionsLogged: room.revisions_logged,
    today,
    // The API counts a deal's length from the day the deed was sent, so the room left is counted from today.
    maxDays: Math.max(0, limit - sentDaysAgo),
    viewer: room.role === "client" ? "client" : "maker",
  };
}

function deliverEffect(room: Room, idx: number): string | undefined {
  return room.milestones.find((m) => m.idx === idx)?.actions.find((a) => a.action === "deliver")?.effect;
}

interface Reading {
  title: string;
  quote: string | null;
  quoteLabel: string;
  effect: string;
}

/** What applying a slip will do, in the plain words the slip itself carries. */
function reading(proposal: Proposal, room: Room): Reading {
  const { action } = proposal;
  const other = firstName(otherParty(room));
  const due = (idx: number) => {
    const m = room.milestones.find((x) => x.idx === idx);
    return m ? dayOf(m.due_at) : "";
  };
  switch (action.type) {
    case "mark_delivered": {
      const idx = action.milestone_idx;
      return {
        title: idx === null ? "Mark a milestone delivered" : `Mark milestone ${toRoman(idx)} delivered`,
        quote: action.note || null,
        quoteLabel: `Note for ${other}`,
        effect:
          idx === null
            ? "Pick which one. The slip will then say exactly what happens to the money."
            : (deliverEffect(room, idx) ?? `Milestone ${toRoman(idx)} can't be marked delivered right now.`),
      };
    }
    case "log_revision": {
      const idx = action.milestone_idx;
      const allowed = room.revisions_allowed;
      const nth = proposal.revisionNumber;
      const count =
        allowed === "unlimited"
          ? " The deed allows as many as needed."
          : typeof allowed === "number" && nth !== undefined && nth <= allowed
            ? ` That makes ${nth} of the ${allowed} the deed covers.`
            : "";
      return {
        title: idx === null ? "Log a revision" : `Log a revision on milestone ${toRoman(idx)}`,
        quote: action.note || null,
        quoteLabel: "As asked",
        effect: `Enters a revision request in the register, where you both can see it.${count}`,
      };
    }
    case "delay": {
      const idx = action.milestone_idx;
      if (idx === null) {
        return { title: "Note a delay", quote: action.note || null, quoteLabel: "Said", effect: "Pick which milestone is running late." };
      }
      if (action.new_date) {
        return {
          title: `Ask to move milestone ${toRoman(idx)} to ${formatIsoDate(action.new_date)}`,
          quote: action.note || null,
          quoteLabel: `Reason ${other} will see`,
          effect: `Asks ${other} to move it from ${due(idx)} to ${formatIsoDate(action.new_date)}. The date changes only if ${other} agrees.`,
        };
      }
      return {
        title: `Note a delay on milestone ${toRoman(idx)}`,
        quote: action.note || null,
        quoteLabel: "Said",
        effect: `Enters the delay in the register. The due date stays ${due(idx)}; to move it, say the new date, or use “Ask to move this date” on the milestone.`,
      };
    }
    case "note":
      return {
        title: "Note it in the register",
        quote: action.text,
        quoteLabel: "Note",
        effect: `Goes into the register as it is, where ${other} can read it too.`,
      };
  }
}

function slipNumber(i: number): string {
  return toRoman(i + 1).toLowerCase();
}

interface SlipProps {
  index: number;
  proposal: Proposal;
  choice: Choice;
  room: Room;
  onChoose: (patch: Partial<Choice>) => void;
}

function Slip({ index, proposal, choice, room, onChoose }: SlipProps) {
  const titleId = useId();
  const { title, quote, quoteLabel, effect } = reading(proposal, room);
  const dismissed = choice.decision === "dismiss";
  const number = slipNumber(index);
  const rule = "col-start-2 border-l-[3px] border-double border-bahi px-4";
  return (
    <li
      aria-labelledby={titleId}
      className="sheet grain grid grid-cols-[2.25rem_minmax(0,1fr)] rounded-sm md:grid-cols-[2.75rem_minmax(0,1fr)_13rem]"
    >
      <p
        aria-hidden="true"
        className="col-start-1 row-span-3 row-start-1 m-0 pr-2 pt-3.5 text-right font-display text-lede italic leading-none text-ink-soft md:row-span-2"
      >
        {number}.
      </p>
      <div className={`${rule} row-start-1 min-w-0 pt-3`}>
        <h4 id={titleId} className="m-0 font-serif text-body font-semibold text-ink">
          <span className="sr-only">Slip {number}: </span>
          {dismissed ? (
            <Struck seed={`${index}-${title}`} animate>
              {title}
            </Struck>
          ) : (
            title
          )}
        </h4>
        {quote ? (
          <p className={`m-0 mt-1 text-note ${dismissed ? "text-ink-soft" : "text-ink"}`}>
            <span className="label mr-2">{quoteLabel}</span>
            <q className="font-serif italic">{quote}</q>
          </p>
        ) : null}
        <p className={`measure m-0 mt-2 text-note ${dismissed ? "text-ink-soft" : "text-ink"}`}>{effect}</p>
        {proposal.remark ? <p className="measure m-0 mt-1 text-note italic text-ink-soft">{proposal.remark}</p> : null}
      </div>
      {proposal.warning ? (
        <p
          className={`${rule} row-start-2 m-0 pt-2 font-serif text-note italic text-bahi md:col-start-3 md:row-span-2 md:row-start-1 md:border-l md:border-solid md:pb-3 md:pt-3.5`}
        >
          {proposal.warning}
        </p>
      ) : null}
      <div className={`${rule} row-start-3 flex flex-col items-start gap-3 pb-3 pt-3 md:row-start-2`}>
        {proposal.candidates && !dismissed ? (
          <div>
            <p id={`${titleId}-which`} className="label m-0 mb-1.5">
              Which milestone?
            </p>
            <ToggleGroup.Root
              type="single"
              aria-labelledby={`${titleId}-which`}
              value={choice.milestone === undefined ? "" : String(choice.milestone)}
              onValueChange={(value) => value && onChoose({ milestone: Number(value) })}
              className="flex flex-wrap gap-2"
            >
              {proposal.candidates.map((idx) => {
                const m = room.milestones.find((x) => x.idx === idx);
                return (
                  <ToggleGroup.Item
                    key={idx}
                    value={String(idx)}
                    className="smallcaps min-h-10 rounded-sm border hairline bg-paper px-3 text-ui text-ink transition-colors duration-150 ease-out hover:border-ink data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-paper"
                  >
                    Milestone {toRoman(idx)}
                    {m ? <span className="sr-only">, {m.title}</span> : null}
                  </ToggleGroup.Item>
                );
              })}
            </ToggleGroup.Root>
          </div>
        ) : null}
        <ToggleGroup.Root
          type="single"
          aria-label={`Slip ${number}`}
          value={choice.decision}
          onValueChange={(value) => value && onChoose({ decision: value as Decision })}
          className="inline-flex rounded-sm border hairline"
        >
          {(["apply", "dismiss"] as const).map((decision) => (
            <ToggleGroup.Item
              key={decision}
              value={decision}
              className="smallcaps min-h-10 px-3.5 text-ui text-ink-soft transition-colors duration-150 ease-out first:border-r first:border-[color-mix(in_srgb,var(--ink)_18%,transparent)] hover:text-ink data-[state=on]:bg-paper-deep data-[state=on]:font-semibold data-[state=on]:text-ink data-[state=on]:underline data-[state=on]:decoration-1 data-[state=on]:underline-offset-4"
            >
              {decision === "apply" ? "Apply" : "Dismiss"}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>
    </li>
  );
}

function EarlierUpdates({ updates }: { updates: Room["voice_updates"] }) {
  const headingId = useId();
  return (
    <aside aria-labelledby={headingId} className="min-w-0">
      <h3 id={headingId} className="label m-0">
        Your earlier updates
      </h3>
      <ol className="m-0 mt-2 list-none border-t hairline p-0">
        {updates.map((u) => (
          <li key={u.id} className="border-b hairline py-2.5">
            <p className="m-0 font-ui text-micro text-ink-soft">
              <time dateTime={u.created_at} className="figures">
                {formatInstantIst(u.created_at)}
              </time>
              <span aria-hidden="true"> · </span>
              {STATUS_WORDS[u.status] ?? u.status}
            </p>
            <p className="m-0 mt-0.5 line-clamp-3 font-serif text-note italic text-ink">{u.raw_text}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/**
 * The deal room's "What happened today?" blank. Wispr Flow fills it; the interpreter proposes slips; the
 * person applies or dismisses each one. Nothing is recorded until they apply.
 */
export function VoiceUpdates({ room, onChanged }: { room: Room; onChanged: () => void }) {
  const { data: config } = useConfig();
  const inputId = useId();
  const hintId = useId();
  const slipsHeadingId = useId();
  const [hint] = useState(flowHint);
  const [text, setText] = useState("");
  const [heard, setHeard] = useState("");
  const [focused, setFocused] = useState(false);
  const [choices, setChoices] = useState<{ heard: string; byIndex: Record<number, Choice> }>({ heard: "", byIndex: {} });
  const [recorded, setRecorded] = useState<{ fingerprint: string; id: string } | null>(null);
  const [results, setResults] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idle = useRef<number | undefined>(undefined);
  const lastKeyAt = useRef(0);
  const blank = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  const context = useMemo(() => contextFor(room, config?.limits.max_deal_days), [room, config?.limits.max_deal_days]);
  const proposals = useMemo(() => (context && heard.trim() ? interpret(heard, context) : []), [heard, context]);

  if (room.role === null) return null;

  const byIndex = choices.heard === heard ? choices.byIndex : {};
  const choiceAt = (i: number): Choice => byIndex[i] ?? { decision: "apply" };
  const slipAt = (i: number): Proposal => {
    const proposal = proposals[i]!;
    const picked = choiceAt(i).milestone;
    return picked !== undefined && context ? withMilestone(proposal, picked, context) : proposal;
  };
  const actionAt = (i: number): ProposedAction => slipAt(i).action;
  const chosen = proposals.map((_, i) => i).filter((i) => choiceAt(i).decision === "apply");
  const deliveries = chosen.map(actionAt).filter((a) => a.type === "mark_delivered" && a.milestone_idx !== null);
  const pending = text !== heard;

  function problem(): string | null {
    if (proposals.length > MOST_ACTIONS) return "That's a lot for one update. Split it into two and apply each.";
    for (const i of chosen) {
      const proposal = proposals[i]!;
      const action = actionAt(i);
      if (proposal.candidates && choiceAt(i).milestone === undefined) return `Pick the milestone on slip ${slipNumber(i)}, or dismiss it.`;
      if (action.type === "mark_delivered" && action.milestone_idx !== null && !deliverEffect(room, action.milestone_idx)) {
        return `Milestone ${toRoman(action.milestone_idx)} can't be marked delivered right now. Dismiss slip ${slipNumber(i)}.`;
      }
    }
    return null;
  }
  const blocked = problem();

  function choose(i: number, patch: Partial<Choice>) {
    setChoices((previous) => {
      const current = previous.heard === heard ? previous.byIndex : {};
      return { heard, byIndex: { ...current, [i]: { ...(current[i] ?? { decision: "apply" }), ...patch } } };
    });
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    const native = event.nativeEvent as InputEvent;
    const burst =
      native.inputType === "insertFromPaste" ||
      native.inputType === "insertFromDrop" ||
      (Date.now() - lastKeyAt.current > KEY_GAP_MS && next.length - text.length > 1);
    setText(next);
    setResults(null);
    setError(null);
    window.clearTimeout(idle.current);
    if (burst) setHeard(next);
    else idle.current = window.setTimeout(() => setHeard(next), IDLE_MS);
  }

  async function dismissRecorded(id: string) {
    try {
      await api.post(`/voice-updates/${id}/dismiss`);
    } catch (caught) {
      console.warn("an earlier unapplied update was left as it was", id, caught);
    }
  }

  /** One record per version of the slips: a retry after a failure reuses it, a changed version replaces it. */
  async function record(actions: ProposedAction[]): Promise<string> {
    const fingerprint = JSON.stringify([heard, actions]);
    if (recorded?.fingerprint === fingerprint) return recorded.id;
    if (recorded) await dismissRecorded(recorded.id);
    const { id } = await api.post<{ id: string }>(`/deals/${room.id}/voice-updates`, { raw_text: heard, proposed_actions: actions });
    setRecorded({ fingerprint, id });
    return id;
  }

  function clear() {
    window.clearTimeout(idle.current);
    setText("");
    setHeard("");
    setRecorded(null);
  }

  async function apply() {
    const actions = proposals.map((_, i) => actionAt(i));
    const id = await record(actions);
    const milestoneFor = Object.fromEntries(
      chosen.flatMap((i) => {
        const picked = choiceAt(i).milestone;
        return picked === undefined ? [] : [[i, picked]];
      }),
    );
    const response = await api.post<{ results: string[] }>(`/voice-updates/${id}/apply`, { indexes: chosen, milestone_for: milestoneFor });
    clear();
    setResults(response.results);
    onChanged();
    // The button that was pressed is gone with its slips; the blank is where the next update starts.
    window.requestAnimationFrame(() => blank.current?.focus());
  }

  async function applyWithoutMoney() {
    setBusy(true);
    setError(null);
    try {
      await apply();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That didn't go through. Check the register before you try again.");
      if (!(caught instanceof ApiError)) console.error("voice update not applied", caught);
    } finally {
      setBusy(false);
    }
  }

  async function dismissAll() {
    if (recorded) await dismissRecorded(recorded.id);
    clear();
  }

  const applyLabel =
    chosen.length < proposals.length
      ? `Apply ${chosen.length} of ${proposals.length}`
      : proposals.length === 1
        ? "Apply"
        : proposals.length === 2
          ? "Apply both"
          : `Apply all ${proposals.length}`;
  const applyDisabled = chosen.length === 0 || blocked !== null || pending;
  const others = chosen.map(actionAt).filter((a) => a.type !== "mark_delivered");
  const mine = room.voice_updates.filter((u) => u.mine).slice(0, RECENT);

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <h2 className="m-0 font-display text-h3 text-ink">
          <label htmlFor={inputId}>What happened today?</label>
        </h2>
        <p className="measure m-0 mt-1 text-note text-ink-soft">
          Say it the way you would tell {firstName(otherParty(room))}. Each thing heard becomes a slip below, and nothing is
          entered until you apply it.
        </p>

        <div className="measure mt-5">
          <textarea
            ref={blank}
            id={inputId}
            value={text}
            onChange={onChange}
            onKeyDown={() => {
              lastKeyAt.current = Date.now();
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={2}
            maxLength={2000}
            spellCheck
            aria-describedby={hintId}
            placeholder="Milestone do ho gaya, final files Drive pe daal di…"
            className="block min-h-[4.5rem] w-full resize-none rounded-none border-0 border-b border-[color-mix(in_srgb,var(--ink)_45%,transparent)] bg-transparent px-0 py-1.5 font-serif text-deed text-ink outline-none transition-colors duration-150 ease-out [field-sizing:content] placeholder:italic placeholder:text-ink-soft focus:border-bahi focus-visible:outline-none"
          />
          <p
            id={hintId}
            className={`m-0 mt-1.5 flex flex-wrap items-baseline gap-x-2 transition-opacity duration-200 ease-out motion-reduce:transition-none ${focused ? "opacity-100" : "opacity-0"}`}
          >
            <span className="font-ui text-ui text-ink">{hint}</span>
            <span className="font-ui text-micro text-ink-soft">or type it</span>
          </p>
        </div>

        <p className="sr-only" aria-live="polite">
          {proposals.length === 0 ? "" : proposals.length === 1 ? "One slip proposed." : `${proposals.length} slips proposed.`}
        </p>

        {results ? (
          <Notice tone="ok" className="measure mt-6">
            <p className="label m-0">Entered</p>
            <ul className="m-0 mt-1 list-none p-0 text-body">
              {results.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {proposals.length > 0 ? (
          <section aria-labelledby={slipsHeadingId} className="mt-8">
            <h3 id={slipsHeadingId} className="label m-0">
              Heard as
            </h3>
            <ol className="m-0 mt-3 flex list-none flex-col gap-4 p-0">
              {proposals.map((proposal, i) => (
                <Slip
                  key={`${i}-${proposal.action.type}`}
                  index={i}
                  proposal={slipAt(i)}
                  choice={choiceAt(i)}
                  room={room}
                  onChoose={(patch) => choose(i, patch)}
                />
              ))}
            </ol>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {deliveries.length > 0 ? (
                <ConfirmDialog
                  trigger={<Button disabled={applyDisabled}>{applyLabel}</Button>}
                  title={deliveries.length === 1 ? "Mark this milestone delivered?" : "Mark these milestones delivered?"}
                  effect={
                    <div className="flex flex-col gap-2">
                      {deliveries.map((a) =>
                        a.type === "mark_delivered" && a.milestone_idx !== null ? (
                          <p key={a.milestone_idx} className="m-0">
                            {deliverEffect(room, a.milestone_idx)}
                          </p>
                        ) : null,
                      )}
                    </div>
                  }
                  confirmLabel={others.length > 0 ? "Mark delivered and apply the rest" : "Mark delivered"}
                  onConfirm={apply}
                >
                  {others.length > 0 ? (
                    <div className="text-note text-ink">
                      <p className="label m-0">Also entered</p>
                      <ul className="m-0 mt-1 list-disc pl-5">
                        {chosen
                          .filter((i) => actionAt(i).type !== "mark_delivered")
                          .map((i) => (
                            <li key={i}>{reading(slipAt(i), room).title}</li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </ConfirmDialog>
              ) : (
                <Button onClick={() => void applyWithoutMoney()} busy={busy} disabled={applyDisabled}>
                  {applyLabel}
                </Button>
              )}
              <Button tone="quiet" onClick={() => void dismissAll()} disabled={busy}>
                Dismiss all
              </Button>
            </div>
            {blocked ? <p className="m-0 mt-2 text-note text-ink-soft">{blocked}</p> : null}
            {error ? (
              <Notice tone="error" className="measure mt-3">
                {error}
              </Notice>
            ) : null}
          </section>
        ) : null}
      </div>

      {mine.length > 0 ? <EarlierUpdates updates={mine} /> : null}
    </div>
  );
}
