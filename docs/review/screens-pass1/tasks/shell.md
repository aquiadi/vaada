# Group: shell (the frame every page shares, the front pages, global print)

You own: web/src/app/Shell.tsx, web/src/styles/index.css, web/src/components/ui.tsx, web/src/routes/Home.tsx,
web/src/pages/DeedPlate.tsx, web/src/routes/NotFound.tsx, web/src/pages/PayoutStanding.tsx,
web/src/pages/PayoutFormSheet.tsx, web/src/routes/Payouts.tsx, web/src/routes/Login.tsx.

1. Persona slip at phone width (front, editor, many). Below `sm` the fixed slip covers content. Below `sm`, dock
   the persona control in the masthead (a small-caps text button beside the nav, or in the demo band) that opens
   the same persona sheet; keep the fixed corner slip from `sm` up. The aside stays labelled "Dev personas" with
   the same first button at desktop width (the e2e uses it at 1280px). Also give the persona sheet, wherever it
   opens, a position that doesn't cover the page's main action at 390.
2. Grain seam above the footer (all pages): the 64px band from the footer's `mt-16` sits outside `main.grain`.
   Move the space inside the grain (e.g. `pb-16` on main and no top margin on the footer, or grain on the outer
   wrapper) so there is no tone step.
3. Theme radios (all pages, dark especially): native radios render as grey OS discs. Style them as part of the
   paperwork (appearance-none ring with an ink fill when checked and a visible focus ring, or small-caps words
   with the current one underlined in ink, still radios underneath).
4. Footer text: typographic apostrophe in "isn’t"; make the footer's disclaimer sentence match the deed's first
   disclaimer word for word (read web/src/deed/DeedText.tsx DeedDisclaimers; the deed group is converting its
   apostrophes to ’ too). `text-balance` (or a non-breaking "Wispr Flow") so "Flow." isn't orphaned at 390; the
   policy links at 390 should not leave "PRICING" alone on a row (balance them, or tighten the gap).
5. Print, global (index.css and ui.tsx), from several reviewers:
   - Button and ButtonLink get `print:hidden` (buttons do nothing on paper; printed primary buttons came out as
     faint grey boxes).
   - Section headings (SectionMark's heading and h2/h3 generally) `break-after: avoid`; `li`, `tr`, `figure` and
     elements with a `.keep-together` class `break-inside: avoid` (add that utility for others to use);
     `@page { margin: 16mm }`.
   - `thead` keeps repeating (that's right), but never `tfoot`: `tfoot { display: table-row-group }` in print, so
     a ledger's closing balance prints once, at the end.
   - A print-only running head in Shell (`hidden print:block`): the Vaada wordmark, the page's URL and
     "Printed <IST date>" in small type, so every printed page says whose it is and when. The masthead and colophon
     stay `no-print`.
6. Home deed plate (DeedPlate.tsx, Home.tsx). Today it's a full-size crop that ends mid-sentence with no bottom
   edge, so the deed's foot (the Stamp Act line and the seal) never shows. The brief asks for "a real deed rendered
   small as the illustration". Show the whole deed, scaled down, with its foot, disclaimers and seal visible and
   the frame closed. Size it so it is clearly an illustration (at 1440 roughly a 30rem-wide plate; at 390 the
   column width), and report the resulting plate heights. The denomination panel must stay legible enough to
   read "DEED No." at 1440. In print, the plate must not overflow (it currently cuts the right border because
   the JS scale doesn't rerun): make it print at the page width without the transform, or `print:hidden` it with
   its caption kept. Add "Not stamped under the Indian Stamp Act." to the plate's caption.
   Also: `text-balance` on the Wispr hint under the button so "just as well." isn't a short widow at 1440.
7. Payouts (PayoutStanding.tsx, Payouts.tsx). Drop the stamp-green boxed "READY" badge (a dashboard status chip,
   and stamp green is for money released). Keep one statement of the status: the sentence, which must keep
   starting "Ready. Money released to you goes to the account ending" (the e2e waits for it). Other statuses keep
   their sentence too; if they also have a badge, remove it the same way. Let the "On file with Vaada" ruled rows
   run to the sheet's content edge (drop `max-w-xl`) so the sheet has one right edge.
8. Not found (NotFound.tsx): the h1 "There is no page at this address." should set on one line at 1440
   (`max-w-none`, measure only on paragraphs) and `text-balance` when it wraps. Reword "Your own deeds are in
   your index." to say where they are in the interface's own words: signed out, "Once you’re signed in, your own
   deeds are listed under Deeds."; signed in, "Your own deeds are listed under Deeds." with "Deeds" linking to
   /deeds.
9. Login: nothing specific beyond the shell-wide items; check it after your changes in all variants and print.
