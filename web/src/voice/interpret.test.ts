import { describe, expect, it } from "vitest";
import { type InterpretContext, interpret, type ProposedAction, type Proposal, withMilestone } from "./interpret";

/** Saturday 10 October 2026. Milestone I is paid out; II and III are funded and in progress. */
const active: InterpretContext = {
  milestones: [
    { idx: 1, title: "Logo concepts", status: "released", due: "2026-10-02" },
    { idx: 2, title: "Brand guidelines", status: "held", due: "2026-10-20" },
    { idx: 3, title: "Final files and handover", status: "held", due: "2026-11-05" },
  ],
  revisionsAllowed: 3,
  revisionsLogged: 1,
  today: { y: 2026, m: 10, d: 10 },
  maxDays: 150,
  viewer: "maker",
};

/** II is delivered and in review; only III is still being worked on. */
const inReview: InterpretContext = {
  ...active,
  milestones: [
    { idx: 1, title: "Logo concepts", status: "released", due: "2026-10-02" },
    { idx: 2, title: "Brand guidelines", status: "delivered", due: "2026-10-20" },
    { idx: 3, title: "Final files and handover", status: "held", due: "2026-11-05" },
  ],
};

const usedUp: InterpretContext = { ...inReview, revisionsLogged: 3 };
const client: InterpretContext = { ...inReview, viewer: "client" };

const website: InterpretContext = {
  ...active,
  milestones: [
    { idx: 1, title: "Logo design", status: "held", due: "2026-10-15" },
    { idx: 2, title: "Website design", status: "held", due: "2026-10-25" },
    { idx: 3, title: "Website launch", status: "held", due: "2026-11-10" },
  ],
};

type Seen = ProposedAction & { candidates?: number[]; warning?: string };

function heard(text: string, ctx: InterpretContext): Seen[] {
  return interpret(text, ctx).map(({ action, candidates, warning }) => ({
    ...action,
    ...(candidates ? { candidates } : {}),
    ...(warning ? { warning } : {}),
  }));
}

const delivered = (milestone_idx: number | null, note = ""): Seen => ({ type: "mark_delivered", milestone_idx, note });
const revision = (milestone_idx: number | null, note: string): Seen => ({ type: "log_revision", milestone_idx, note });
const delay = (milestone_idx: number | null, new_date: string | null, note: string): Seen => ({
  type: "delay",
  milestone_idx,
  new_date,
  note,
});
const note = (text: string): Seen => ({ type: "note", text });

describe("interpret: what people say happened today", () => {
  it.each<[string, string, InterpretContext, Seen[]]>([
    [
      "the example from the brief",
      "Milestone do ho gaya, final files Drive pe daal di, Rahul ne bola colors thode warm karo",
      active,
      [delivered(2, "Final files Drive pe daal di"), revision(2, "Rahul ne bola colors thode warm karo")],
    ],
    ["numbered milestone, Hinglish", "Milestone 2 deliver kar diya.", active, [delivered(2)]],
    ["Hindi ordinal", "Doosra milestone ho gaya.", active, [delivered(2)]],
    ["Hindi ordinal said alone", "Teesra wala bhi bhej diya.", active, [delivered(3)]],
    ["roman numeral as Wispr writes it", "Milestone III submitted.", active, [delivered(3)]],
    ["Hindi number word", "Milestone teen ho gaya.", active, [delivered(3)]],
    ["part, in English", "Part 2 is done.", active, [delivered(2)]],
    [
      "English with a second sentence",
      "Milestone two is done. The files are in the shared Drive folder.",
      active,
      [delivered(2, "The files are in the shared Drive folder")],
    ],
    [
      "title words pick the milestone and stay as the note",
      "Brand guidelines PDF bhej di Rahul ko.",
      active,
      [delivered(2, "Brand guidelines PDF bhej di Rahul ko")],
    ],
    [
      "no reference with two milestones held asks which",
      "Final files Drive pe daal di.",
      active,
      [{ ...delivered(null, "Final files Drive pe daal di"), candidates: [2, 3] }],
    ],
    [
      "no reference with one milestone held picks it",
      "Final files Drive pe daal di.",
      inReview,
      [delivered(3, "Final files Drive pe daal di")],
    ],
    [
      "a title word shared by two milestones narrows it to them",
      "Website ka kaam ho gaya.",
      website,
      [{ ...delivered(null), candidates: [2, 3] }],
    ],
    ["two title words settle it", "Website launch ho gaya, live hai.", website, [delivered(3), note("Live hai")]],
    [
      "a milestone the deed doesn't have",
      "Milestone 5 ho gaya.",
      active,
      [{ ...delivered(null), candidates: [2, 3] }],
    ],
    [
      "a milestone the deed doesn't have, with one open, still asks",
      "Milestone 5 ho gaya.",
      inReview,
      [{ ...delivered(null), candidates: [3] }],
    ],
    ["a milestone already paid out becomes a note", "Milestone 1 ho gaya.", active, [note("Milestone 1 ho gaya")]],
    [
      "the client can't mark work delivered",
      "Aditi ne teesra milestone bhej diya.",
      client,
      [note("Aditi ne teesra milestone bhej diya")],
    ],
    ["almost done is not done", "Almost done with milestone 2.", active, [note("Almost done with milestone 2")]],
    ["payment talk is a note", "Advance payment ho gaya.", active, [note("Advance payment ho gaya")]],
    [
      "changes already made are a note, sending them is not a delivery",
      "Changes kar diye, Rahul ko bhej diye.",
      inReview,
      [note("Changes kar diye, Rahul ko bhej diye")],
    ],
    [
      "a revision on the one milestone in review",
      "Rahul ne kaha colors thoda aur warm karo.",
      inReview,
      [revision(2, "Rahul ne kaha colors thoda aur warm karo")],
    ],
    [
      "past the deed's revisions",
      "Rahul ne bola logo thoda aur bada karo.",
      usedUp,
      [
        {
          ...revision(2, "Rahul ne bola logo thoda aur bada karo"),
          warning: "This looks like a 4th revision. The deed covers 3.",
        },
      ],
    ],
    [
      "two asks in one breath are one round",
      "Colors warm karo, aur font bhi change karo.",
      inReview,
      [revision(2, "Colors warm karo, aur font bhi change karo")],
    ],
    [
      "a revision with nothing in review asks which",
      "Colors thode warm karo.",
      active,
      [{ ...revision(null, "Colors thode warm karo"), candidates: [2, 3] }],
    ],
    ["English revision", "Rahul wants the logo a bit bigger.", inReview, [revision(2, "Rahul wants the logo a bit bigger")]],
    [
      "the client asks for changes",
      "Colours thode warm karo, logo thoda bada karo.",
      client,
      [revision(2, "Colours thode warm karo, logo thoda bada karo")],
    ],
    [
      "delay to a weekday",
      "Teesra milestone Friday tak aage karna padega.",
      active,
      [delay(3, "2026-10-16", "Teesra milestone Friday tak aage karna padega")],
    ],
    [
      "delay by a few days counts from the due date",
      "Milestone 2 mein do din ki der hogi.",
      active,
      [delay(2, "2026-10-22", "Milestone 2 mein do din ki der hogi")],
    ],
    [
      "delay by a week, in English",
      "The third milestone will be late by a week.",
      active,
      [delay(3, "2026-11-12", "The third milestone will be late by a week")],
    ],
    [
      "more days, Hinglish",
      "Milestone 3 ke liye do din aur chahiye.",
      active,
      [delay(3, "2026-11-07", "Milestone 3 ke liye do din aur chahiye")],
    ],
    [
      "more days, English, the title naming the milestone",
      "Need two more days for the brand guidelines.",
      active,
      [delay(2, "2026-10-22", "Need two more days for the brand guidelines")],
    ],
    [
      "delay to a calendar date",
      "Milestone 3 will slip to 20 October.",
      active,
      [delay(3, "2026-10-20", "Milestone 3 will slip to 20 October")],
    ],
    [
      "delay without a date",
      "Brand guidelines thoda late ho jayenge.",
      active,
      [delay(2, null, "Brand guidelines thoda late ho jayenge")],
    ],
    [
      "delay without a milestone asks which",
      "Thoda late hoga, Rahul ko bata diya.",
      active,
      [{ ...delay(null, null, "Thoda late hoga"), candidates: [2, 3] }, note("Rahul ko bata diya")],
    ],
    [
      "the length said after the delay belongs to it",
      "Milestone 3 ke liye thoda aur time chahiye, do hafte.",
      active,
      [delay(3, "2026-11-19", "Milestone 3 ke liye thoda aur time chahiye, do hafte")],
    ],
    [
      "next week",
      "Doosra milestone agle hafte tak delay hoga.",
      active,
      [delay(2, "2026-10-17", "Doosra milestone agle hafte tak delay hoga")],
    ],
    [
      "a festival",
      "Teesra milestone Diwali ke baad tak aage karna hoga.",
      active,
      [delay(3, "2026-11-09", "Teesra milestone Diwali ke baad tak aage karna hoga")],
    ],
    [
      "a call, then the client asks to push",
      "Aaj Rahul ke saath call thi, unhone bola teesra milestone ek hafta aage kar do.",
      active,
      [note("Aaj Rahul ke saath call thi"), delay(3, "2026-11-12", "Unhone bola teesra milestone ek hafta aage kar do")],
    ],
    [
      "several things in one go",
      "Pehla milestone ho gaya. Doosre milestone mein teen din ki der hogi. Rahul ka feedback abhi aana baaki hai.",
      { ...active, milestones: active.milestones.map((m) => ({ ...m, status: "held" })) },
      [
        delivered(1),
        delay(2, "2026-10-23", "Doosre milestone mein teen din ki der hogi"),
        note("Rahul ka feedback abhi aana baaki hai"),
      ],
    ],
    [
      "plain clauses run together into one note",
      "Rahul se call hui, woh direction se khush hain.",
      active,
      [note("Rahul se call hui, woh direction se khush hain")],
    ],
    [
      "an English note",
      "Had a long call with Rahul about the launch plan.",
      active,
      [note("Had a long call with Rahul about the launch plan")],
    ],
    ["filler alone is nothing", "Okay.", active, []],
    ["nothing at all", "   ", active, []],
  ])("%s", (_name, text, ctx, expected) => {
    expect(heard(text, ctx)).toEqual(expected);
  });
});

describe("interpret: revision count against the deed", () => {
  it.each<[string, InterpretContext["revisionsAllowed"], number, string | undefined]>([
    ["within the deed", 3, 1, undefined],
    ["the last one the deed covers", 3, 2, undefined],
    ["one past", 3, 3, "This looks like a 4th revision. The deed covers 3."],
    ["well past", 2, 10, "This looks like a 11th revision. The deed covers 2."],
    ["unlimited", "unlimited", 12, undefined],
    ["none covered", 0, 0, "This looks like a revision, and the deed doesn't cover any."],
  ])("%s", (_name, allowed, logged, warning) => {
    const [proposal] = interpret("Logo thoda bada karo.", { ...inReview, revisionsAllowed: allowed, revisionsLogged: logged });
    expect(proposal?.revisionNumber).toBe(logged + 1);
    expect(proposal?.warning).toBe(warning);
  });
});

describe("interpret: what the slips say quietly", () => {
  function only(text: string, ctx: InterpretContext): Proposal {
    const proposals = interpret(text, ctx);
    expect(proposals).toHaveLength(1);
    return proposals[0]!;
  }

  it("names a milestone the deed doesn't have", () => {
    expect(only("Milestone 5 ho gaya.", active).remark).toBe("There's no milestone V in this deed.");
  });

  it("says why a delivery became a note", () => {
    expect(only("Milestone 1 ho gaya.", active).remark).toBe(
      "Milestone I is already released, so this goes in the register as a note.",
    );
  });

  it("explains a delay counted from the due date", () => {
    expect(only("Milestone 2 mein do din ki der hogi.", active).remark).toBe(
      "Read this as 2 days after milestone II's due date: Thu 22 Oct 2026.",
    );
  });

  it("passes on how the date normalizer read a loose date", () => {
    expect(only("Need to push milestone 2 to next Friday.", active)).toMatchObject({
      action: { type: "delay", milestone_idx: 2, new_date: "2026-10-16" },
      remark: 'Read "next friday" as Fri 16 Oct 2026.',
    });
  });

  it("won't move a date past the deal's limit", () => {
    const proposal = only("Teesra milestone 6 mahine aage karna padega.", active);
    expect(proposal.action).toMatchObject({ type: "delay", milestone_idx: 3, new_date: null });
    expect(proposal.remark).toMatch(/at most 150 days/);
  });
});

describe("withMilestone: once the person picks", () => {
  it("works out a delay's date from the milestone picked", () => {
    const [proposal] = interpret("Thoda late hoga, ek hafta.", active);
    expect(proposal?.candidates).toEqual([2, 3]);
    expect(proposal?.action).toMatchObject({ type: "delay", milestone_idx: null, new_date: null });
    const picked = withMilestone(proposal!, 3, active);
    expect(picked.action).toEqual(delay(3, "2026-11-12", "Thoda late hoga, ek hafta"));
    expect(picked.remark).toBe("Read this as a week after milestone III's due date: Thu 12 Nov 2026.");
  });

  it("fills in the milestone for a delivery", () => {
    const [proposal] = interpret("Final files Drive pe daal di.", active);
    expect(withMilestone(proposal!, 2, active).action).toEqual(delivered(2, "Final files Drive pe daal di"));
  });
});
