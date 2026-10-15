# Group: editor (/new)

You own: web/src/editor/** (DeedEditor.tsx, Margin.tsx, BlankInput.tsx, SendPanel.tsx, state.ts, useAutosave.ts,
EditorContext.tsx and their tests), web/src/routes/NewDeed.tsx.
The deed group is changing web/src/deed/DeedText.tsx at the same time (hanging roman sub-clauses, § 3 sentence
order, apostrophes, read-only sheet width) and will report a change for struck empty blanks in EditSheet; take it
into DeedEditor.tsx when you see it in their file, or do it yourself if it's clearly what they describe: an empty
blank inside a struck clause renders as a continuous rule (inline-block span with a bottom border) instead of
"________".

1. Holes in the deed at 1440: Para is a two-column grid row, so a short paragraph with several stacked "To fill in"
   notes pushes the next paragraph down (~110px gap after § 3's first sentence, ~150px under part (i)). In
   Margin.tsx merge a paragraph's empty-required notes into one note ("To fill in: client’s name,
   organisation"); keep separate notes only for heard words, guesses and failures. Measure the gaps before and
   after on a fresh draft and on a filled draft with two parts. If a hole remains, report what Para would need.
2. Error text in the margin is bahi red text (`text-bahi`) beside a bahi rule. Make failed, problem and sum notes
   ink text beside the red rule; keep `text-bahi` only on the † dagger.
3. Failed blanks show raw dictation with Wispr's full stop, then the deed's own punctuation: "Utna hi jitna pichli
   baar. , in these parts: Baad mein dekhenge. ." For display only, strip trailing sentence punctuation and space
   from the raw text (`[\s.।!?]+$`); keep the full raw text in the margin and the heard editor.
4. Blanks at rest: the at-rest span's `px-0.5` and underline box push the following comma/colon/full stop a few
   pixels away ("Aditi Rao , hereinafter"). Drop the horizontal padding (keep the focus outline via
   outline-offset). For filled values (not empty, not failed) make the dotted underline much quieter so a filled
   deed reads as one document; keep empty blanks' underline as it is.
5. Print the draft as a draft deed, not a form: `no-print` (or print:hidden) on the status row above the sheet
   (h1 + save status), the SendPanel/SentPanel section, StrikeToggle in the margin, the inline Add a part / Remove
   part N buttons. Consider hiding plain "To fill in" notes in print, keeping failure notes.
6. SendPanel wording: "Blanks still to fill are noted in the margin." and "…They’re marked in the margin." are
   wrong at 390, where there's no margin column. Say something that holds on both layouts and says the deed can't
   go out until they're filled, e.g. "Blanks still to fill are marked with a red rule beside their lines; the deed
   can’t go out until they’re filled."
7. SendPanel / SentPanel rule: `border-t-2 border-double` renders as one solid 2px gold bar; use a real double
   hairline (`border-t-[3px] border-double`, or the `rule-double` hr). Line the Send button up with the email
   field's rule, not the bottom of the hint below it.
8. Strike link wording (Margin.tsx): "Strike the organisation" names something that isn't a clause (it removes "of
   [their organisation]"). Reword it (e.g. "Strike “of their organisation”" / "Restore the organisation") or keep
   it out of the "Optional clauses" list in the foot controls; use the reviewer's judgement in pass1-front-editor.md.
9. Page edge: DeedEditor uses `max-w-[76rem]` so "A NEW DEED" and the sheet start 24–32px left of the masthead's
   wordmark. Put the status row and Send panel on the shared left edge (`mx-auto max-w-6xl px-6`); the sheet may
   bleed wider with a negative margin if the margin column needs the room, but keep its text and margin readable.
