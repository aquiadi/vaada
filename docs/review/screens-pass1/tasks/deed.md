# Group: deed (the deed text, the sheet, the seal, the styleguide)

You own: web/src/deed/DeedText.tsx, web/src/deed/PublishedDeed.tsx, web/src/deed/blanks.ts,
web/src/deed/summary.ts (+ tests), web/src/deed/sample.ts, web/src/design/DeedSheet.tsx, web/src/design/Seal.tsx,
web/src/design/Strike.tsx, web/src/normalize/text.ts and web/src/normalize/text.test.ts (and other normalize
tests if needed), web/src/routes/Styleguide.tsx.
The deed's words are corrected in place (no AGREEMENT_VERSION bump: nothing is live; DECISIONS.md records this).
The hash covers the terms JSON, not the rendered English, so wording changes don't break verification, but don't
change what the terms JSON contains or how it is canonicalised.

1. Read-only sheet (room, client): with no margin column the 68ch text fills only the left two-thirds of a wide
   sheet and the double rules and seal run past it. A read-only deed renders as `mx-auto max-w-[52rem]` and its
   text, double rules and foot fill that width (adjust padding so the measure fills it). Check /d and /a at 1440:
   the pages shouldn't need changes for this (the room group aligns its slips to 52rem).
2. § 3 The money, as published (client). "in these parts: On delivery." (one part, plural) and "Advance and On
   delivery" (capital mid-sentence) read wrong. In the read-only deed, build it from the count: "in one part, as
   follows:" / "in two parts, as follows:" (numberWord). Reorder each sub-clause so free text comes after a colon,
   where a capital is natural: "(i) Advance, ₹12,500, due by Mon 5 Oct 2026: Do logo directions aur mood board."
   In the editor keep the plan blank in the sentence (the e2e expects "50% in advance, the rest on delivery" to
   show), but make the sub-clauses follow the same order so editing and reading match.
3. Roman sub-clauses (editor, room, client): hang them. The numeral in its own column (e.g. a
   `grid-cols-[2.5em_minmax(0,1fr)]` row, or a hanging indent), wrapped lines aligned under the text, no tab-like
   gap. Check the editor at /new too, where Para also carries the margin column and part controls.
4. Typographic apostrophes and quotes throughout DeedText.tsx (body and DeedDisclaimers): gateway’s, Maker’s,
   part’s, isn’t, Vaada’s, don’t, Razorpay’s. The shell group matches the footer to your first disclaimer.
5. Evidence block at the deed's foot (PublishedDeed): `space-y-3` does nothing because children carry `m-0`; use
   `flex flex-col gap-3` or explicit margins so acceptance line, disclaimers and hash/nonce are spaced. Put each
   label on its own line with its value under it; render hash and nonce so they never leave 1–3 character orphans
   at 390 (8-character groups separated by <wbr> or thin spaces kept out of copied text; copying must still give
   the exact hex). Same treatment wherever PublishedDeed shows a hash.
6. RegistryLink (PublishedDeed.tsx; used by the room's MilestoneLedger and by Maker): on paper it prints nothing
   checkable ("On Polygonscan", or a 10-character prefix). Add a print-only full tx hash (Plex Mono, wrapping
   cleanly) beside it. On screen for the local chain, show the full hash in a way that wraps without orphans
   (so the maker certificate's "each line is that record" holds), or keep it short on screen and full in print;
   your call, but say which.
7. Struck clauses: empty blanks inside them render as typed underscores "________" (broken dashes). Render a
   continuous rule, e.g. an inline-block span with a bottom border, the same in the editor (EditSheet in
   web/src/editor/DeedEditor.tsx does this too: report the change it needs under "Needs from others") and read view.
8. Sentence slots keep Wispr's capital (room): milestone deliverables and the IP exclusions use blank kind
   "text", so "except Drafts aur jo concepts…" and "for Final logo files…" keep a capital mid-sentence. Add a
   phrase kind for `milestones.N.deliverables` and `ip_transfer.exclusions` that runs the same un-Wispr step as
   work() and lowercases the first word unless it's all capitals, mixed case, or a party's/organisation's name.
   With the reorder in item 2 the deliverables follow a colon: decide whether deliverables still lowercase there
   (probably keep as said after a colon), but exclusions sit mid-sentence and must. Table tests for the new kind.
9. Denomination panel (DeedSheet): the Devanagari वादा inside `.label` gets all-small-caps and renders at ~60% of
   the Latin, an illegible smudge when scaled. On that span reset `font-variant-caps: normal`, letter-spacing 0,
   size about 1.15em so it matches VAADA's cap height.
10. Print frame (DeedSheet): the guilloche is one SVG for the whole tall sheet, so a printed deed has a top band on
    page 1, side bands only in the middle, the bottom band on the last page. In print, hide the SVG frame and give
    the sheet a CSS double rule in stamp green with `box-decoration-break: clone` (print: variants in your file),
    so each printed page has a closed frame; keep the denomination panel on page 1.
11. Seal (Seal.tsx): (a) unstamped, it still prints "FUNDED" inside; draw the caption only when stamped. (b) with no
    hash the ring reads "VAADA · वादा ·  · VAADA"; drop the empty segment. (c) the ring legend covers only ~4/5 of
    the circle, leaving a lopsided gap: set textLength to the path length with lengthAdjust="spacing" (or compose
    the legend to fill), one "VAADA · वादा" plus the hash. Make sure it still reads at 120–168px.
12. Blank labels (blanks.ts): margin labels switch between "you" and "the Maker" ("The work you’ll deliver" vs
    "What the Maker keeps rights to"). Use the second person for the Maker's own blanks ("What you keep the rights
    to"). (The strike link wording lives in the editor group's Margin.tsx.)
13. Styleguide: (a) §9 shows "Not yet accepted." beside a stamped FUNDED seal, an impossible state: pass a sample
    acceptance (Rahul Mehta, masked email, a date) so it reads accepted and funded. (b) "Parts are numbered I, II,
    III, IV." contradicts the deed's (i), (ii): say what's used where ("In the deed, parts are (i), (ii), (iii);
    elsewhere Part I, Part II.") and show both. (c) Spacing: Specimen `mb-10` inside a grid that also has `mb-10`
    doubles the gap after §3; the "Stamp it again" button sits off the captions' baseline and its padding pushes
    it off the content edge at 390. (d) the §8 slip's shortened hash should not break ("0x185fbd / ab7858…"):
    whitespace-nowrap. (e) Page container on the shared left edge (`mx-auto max-w-6xl px-6`).
