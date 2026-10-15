## [should-fix] home | 1440 light and dark, 390 light and dark | stamp paper
WHERE: The deed plate under the hero button. It ends at 'copyright in the final work delivered, except drafts, unused concepts and' at 1440, and at 'The Maker shall deliver a logo, a colour palette and a' at 390. Then comes the figcaption.
PROBLEM: The plate is cut by a hard edge in the middle of a sentence. The guilloche frame has no bottom edge, so it looks like a broken render rather than a chosen excerpt. Because only the first 700px is shown, the foot of the deed never appears on the page most people see. That foot carries 'This deed is not stamped under the Indian Stamp Act.' and the seal. The brief also asks for 'a real deed rendered small', but this is a full-size crop of the head.
FIX: In DeedPlate.tsx, measure the rendered deed and set the window height to end at a clause boundary, for example just after the § 1 paragraph or the end of § 2, instead of the fixed `shown: 700/560`. Close the frame with a bottom hairline, or a short '· · ·' continuation rule inside the mount, so the cut reads as intentional. Add the Stamp Act line to the figcaption: '...a logo and brand guidelines in two parts. Not stamped under the Indian Stamp Act.' The better option is to show the whole deed at a smaller scale with its foot and seal visible.
FILES: pages/DeedPlate.tsx, routes/Home.tsx

## [should-fix] home | print (1440 emulated print and A4 PDF) | print
WHERE: Right edge of the deed plate: the right guilloche border and the top-right corner rosette
PROBLEM: On paper the right side of the deed is cut off. The vertical border prints half-width and the corner rosette is cut in half. DeedPlate works out `scale = width / 980` in JS from the screen width (726px at 1440). Print layout narrows the window (to about 704px on A4 with no margins, less with the browser's default margins), but no ResizeObserver callback runs for print, so the 980px deed stays at the screen scale and overflows its `overflow-hidden` window.
FIX: Add a print rule that doesn't depend on JS. Give the window and inner div classes, for example `.plate-window` and `.plate-page`. Then in `@media print` drop the transform and the fixed width (`.plate-page { transform: none !important; width: auto !important }`), let PublishedDeed lay out at the page's own width in its compact form, and cap the window with a CSS `max-height` rather than the inline JS height. The simpler alternative is to mark the plate `no-print` and print only the caption.
FILES: pages/DeedPlate.tsx, styles/index.css

## [should-fix] home, login, not-found (any page with a primary Button/ButtonLink) | print | print
WHERE: 'Draw up a deed' on home, 'Email me a code' on login, 'Back to the first page' on not-found
PROBLEM: When printed, the primary button keeps `text-paper` but loses its `bg-ink` background. It comes out as an outlined box with a faint grey label: the darkest label pixel in the A4 PDF is rgb(159,155,147) on white. It is barely legible, and a call-to-action box means nothing on paper anyway. The print block in index.css hides only `.no-print` and the sheet shadow.
FIX: Add `no-print` to the call-to-action links that do nothing on paper (Home hero ButtonLink, NotFound ButtonLink, and the login form's submit). In index.css `@media print`, add a fallback for any button that does print: `.bg-ink { background: none !important; } .text-paper { color: var(--ink) !important; }`, or simply `button, a.inline-flex { display: none }` inside main.
FILES: components/ui.tsx, styles/index.css, routes/Home.tsx, routes/NotFound.tsx

## [should-fix] payouts | all | dashboard-ism
WHERE: Top of the status sheet: the double-bordered green 'READY' box, followed by the sentence 'Ready. Money released to you goes to the account ending 4417.'
PROBLEM: The status is said twice, once in a boxed badge and again as the first word of the sentence under it. The badge is a green 'success' pill, the traffic-light status chip a dashboard would have. It also uses stamp green, which is reserved for the guilloche and money released, to mark an account being verified. No money has been released here.
FIX: Keep one statement of the status. Either drop the boxed stamp for the activated state and let the sentence carry it, or keep a rubber-stamp mark set in ink (not stamp green) and start the sentence at 'Money released to you goes to the account ending 4417.' In PayoutStanding.tsx, change `${ready ? "border-stamp text-stamp" : ...}` to always use ink/ink-soft, and remove the leading 'Ready.' in the `activated` Explanation if the stamp stays.
FILES: pages/PayoutStanding.tsx

## [should-fix] all (home, login, payouts, not-found) | 390 light and dark (at 1440 it sits in the empty left gutter) | layout
WHERE: The fixed 'PERSONAS' / 'AS ADITI RAO' slip at the bottom left
PROBLEM: At phone width the slip floats over the content. In the captures it covers '§ 1. The parties' in the home deed plate, the 'ACCOUNT' label on payouts, and 'Set in Cormorant...' in the colophon on login and not-found. It is shown whenever `config.persona_switcher` is on, and that includes the public demo (login says 'This is a demo copy...'), so demo visitors will see content hidden behind it.
FIX: Below the `sm` breakpoint, stop floating PersonaSlip. Dock it as a small-caps text button in the masthead nav or the DemoBand, and open the persona sheet from there. Keep the fixed corner slip only at `sm` and up, for example with `hidden sm:block` on the fixed aside plus an inline trigger in the masthead for narrow screens.
FILES: app/Shell.tsx

## [polish] all (home, login, payouts, not-found) | all | layout
WHERE: The 64px strip just above the footer's hairline rule
PROBLEM: The paper grain is on `<main className="grain">`, but the gap before the footer comes from `mt-16` on the footer, which lies outside main. That leaves a 64px band of untextured paper-deep that is visibly a different tone from the page above it: light theme rgb(230,221,201) against rgb(233,224,204), dark theme rgb(18,16,11) against rgb(15,13,9). It shows as a seam on every page (measured gap 64px on all four routes).
FIX: Move the spacing inside main: remove `mt-16` from the Colophon footer and add `pb-16` to main. Or put `.grain` on the outer Shell wrapper so the masthead, main and footer share one texture.
FILES: app/Shell.tsx

## [polish] all (home, login, payouts, not-found) | dark 1440 and 390 (stock look in light too) | contrast
WHERE: Footer theme toggle: Match device / Light / Dark
PROBLEM: These are native radio inputs with only `accent-[var(--ink)]` applied. Under the dark color-scheme, Chromium draws the unchecked radios as grey filled discs, which read as disabled controls. They are the one stock browser widget left on otherwise typeset paper.
FIX: Restyle with `appearance-none`: a 10px circle with a 1px ink-soft border, filled ink when `:checked`, with a `:focus-visible` ring. Or present the three choices like the nav links: small-caps words with the current one underlined in ink, still radios underneath for accessibility.
FILES: app/Shell.tsx

## [polish] all (home, login, payouts, not-found) | all | wording
WHERE: Footer line 'Vaada helps people write down what they agreed and isn't a lawyer.' Also the deed's foot disclaimers.
PROBLEM: The footer uses a straight apostrophe in "isn't", while every other line uses typographic ones, including 'isn’t in your account' on the same home page. The deed's DeedDisclaimers have the same problem ("isn't", "Vaada's", "don't"), as does the deed body ("Maker's", "part's"). It's a visible slip in a product that sells typesetting.
FIX: Replace ' with ’ in Shell.tsx line 124 and in DeedText.tsx (DeedDisclaimers lines 164-166 and the body's "Maker's" and "part's"). Consider a lint or grep check for straight apostrophes in JSX text.
FILES: app/Shell.tsx, deed/DeedText.tsx

## [polish] all (home, login, payouts, not-found); home hero | 390 light and dark (footer); 1440 light and dark (home hint) | layout
WHERE: Footer policy links, colophon, and the home Wispr hint under 'Draw up a deed'
PROBLEM: At 390 the policy links wrap to leave 'PRICING' alone on a second row, and the colophon leaves 'Flow.' alone on its own line. At 1440 the home hint 'Wispr Flow lets you dictate... typing works' wraps to leave 'just as well.' on a short second line.
FIX: Add `text-wrap: balance` (Tailwind `text-balance`) to the colophon paragraph and the home hint paragraph. For the links, reduce `gap-x-5` to `gap-x-4` at narrow widths, or balance the wrap so the six links split three and three.
FILES: app/Shell.tsx, routes/Home.tsx

## [polish] not-found | 1440 light and dark | layout
WHERE: H1 'There is no page at this address.'
PROBLEM: The heading breaks with 'address.' alone on the second line. It is set at text-h1 inside an `<article className="measure">` whose 68ch is sized for body text, so a single-line display heading is forced to wrap even though the right half of the page is empty.
FIX: Give the h1 `max-w-none` (or move the `measure` class to the paragraphs only) so it sets on one line at 1440, and add `text-balance` so narrower widths wrap evenly.
FILES: routes/NotFound.tsx

## [polish] not-found | all | wording
WHERE: Body sentence ending 'Your own deeds are in your index.'
PROBLEM: 'index' appears nowhere else in the interface: the masthead calls the same page 'Deeds'. The page is shown signed out (the masthead says 'Sign in'), so the sentence also assumes you have deeds and a session.
FIX: Say 'Once you’re signed in, your own deeds are listed under Deeds.' and link 'Deeds'. When `useMe()` returns a user, use the shorter 'Your own deeds are listed under Deeds.'
FILES: routes/NotFound.tsx

## [polish] home | all (most visible in the scaled plate at 390) | stamp paper
WHERE: The denomination panel at the head of the deed: 'VAADA · वादा / DEED No. 0042'
PROBLEM: The Devanagari वादा sits inside a `.label` span, which sets `font-variant-caps: all-small-caps`. It renders at roughly 60% of the Latin small caps. In the scaled home plate that is about 5px, an illegible smudge in the one place that carries Vaada's own mark.
FIX: On the deva span in DeedSheet.tsx, set `font-variant-caps: normal` (Tailwind `normal-case` doesn't reset it), `letter-spacing: 0` and a size of about 1.15em, so वादा matches the cap height of VAADA.
FILES: design/DeedSheet.tsx

## [polish] payouts | 1440 light and dark | layout
WHERE: The 'On file with Vaada' ruled rows inside the status sheet
PROBLEM: The ruled entries are capped at `max-w-xl` (576px), so their rules stop about 120px short of the sheet's right padding. Meanwhile the explanation above runs at a 68ch measure and ends further right. The result is a ragged right edge and a dead column inside a 46rem sheet, which weakens the 'bank form on paper' look.
FIX: Drop `max-w-xl` from the `<dl>` in PayoutStanding so the rules run to the sheet's content edge, or narrow the sheet (for example `lg:grid-cols-[minmax(0,40rem)_...]`) so the sheet, the measure and the rules share one right edge.
FILES: pages/PayoutStanding.tsx, routes/Payouts.tsx

## [polish] payouts (and every printed page) | print | print
WHERE: Top and foot of the printed page
PROBLEM: The masthead and colophon are both `no-print`, so a printed payouts sheet carries no Vaada name, no address and no date. It is an anonymous 'Where should we send your money?' with a name and IFSC on it. A form on paper should say whose form it is and when it was taken.
FIX: Add a print-only running head in Shell, `hidden print:block`: the wordmark, the page URL and 'Printed 11 Oct 2026' in small type above main. Leave the screen layout unchanged.
FILES: app/Shell.tsx, styles/index.css

CLEAN: ["login: no problems specific to this page in any of the four variants. The slip with its bahi margin rule reads as a paper form, not a stock auth card. The error path keeps ink text beside a bahi rule. Google is missing only because `google_signin_enabled` is off in dev. Only the shell-wide items above apply (persona slip, grain seam, footer radios and apostrophe, and the faint 'Email me a code' in print).", "home, on questions 1 and 2: no feature grids, stat tiles or badges, and no bahi red anywhere. 'How the money works' is plain numbered prose. The deed plate reads as one document, not a form.", 'No horizontal scroll at 390 on any of the four routes (scrollWidth 390 in both themes).', "Stamp-paper check (question 5) on the home plate: the denomination panel carries only 'VAADA · वादा' and 'DEED No. 0042'. There is no emblem, state name, 'Government of', 'India Non Judicial' or rupee duty value."]
==========
## [should-fix] new-deed | print (checked with emulateMedia print at 1440 and as A4 PDF; dark preference prints identically in the light palette) | print
WHERE: Whole page in print: the 'A NEW DEED / Drafts save as you go' line above the sheet, the 'STRIKE THE … / RESTORE THE …' links in the margin, the dashed 'ADD A PART' box inside the deed (deed 0004), and the whole 'Send to client' panel below the sheet
PROBLEM: The masthead, colophon, persona slip and the 'Optional clauses' row are hidden in print, but the other editing controls are not. A printed draft ends with an empty email rule and a black 'SEND THE DEED' button (on A4 that panel gets page 3 or 4 to itself), and the margin is full of strike and restore buttons. As paper, it reads as a screenshot of a form rather than a draft deed.
FIX: Add `no-print` to the SendPanel/SentPanel <section>, to the status row in DeedEditor (the div holding the h1 and the save status), to StrikeToggle when `inMargin`, and to the inline AddPart/RemovePart buttons. Optionally hide the 'To fill in' notes in print too, keeping only the failed-read notes, so a printed draft shows just the deed and the real problems.
FILES: web/src/editor/SendPanel.tsx, web/src/editor/DeedEditor.tsx, web/src/editor/Margin.tsx

## [should-fix] new-deed | 1440 light and dark (the 390 layout stacks the notes, so there is no hole there) | layout
WHERE: §3 The money: after the one-line 'The Client shall pay a total of [total], in these parts: [how it's split].' there is a gap of about 110px before 'The Client pays the whole total…' (y≈929→1039 in new-deed-1440-*). It is the same under §1 and, worse, under roman part (i) in a filled draft, where about 150px of empty paper sits above 'ADD A PART'
PROBLEM: Para is a two-column grid row, so a paragraph's height is the larger of its text and its margin notes. When a short paragraph has two to four notes stacked beside it (each 'To fill in' is a label, a line and a 12px gap), the notes push the next paragraph down. That leaves holes in the deed and uneven paragraph spacing, which is what the Para docstring says it avoids ('leave no holes in the deed').
FIX: In Margin.tsx, merge a paragraph's empty-required notes into one note ('To fill in: client's name, organisation'), so a paragraph's notes rarely run longer than its text. Keep separate notes only for heard words, guesses and failures. If notes can still run long (milestone rows have four blanks), let Para's margin cell take `md:row-span-2` into the next row, or set the text's `min-height` from the note count, rather than letting the notes set the row height.
FILES: web/src/deed/DeedText.tsx, web/src/editor/Margin.tsx

## [should-fix] new-deed | all (not in the pass1 shots, which have no failed blanks; seen on draft 0004 at /new/d39ceae4… at 1440 and 390) | wording
WHERE: Blanks that couldn't be read: 'pay a total of Utna hi jitna pichli baar. , in these parts: Baad mein dekhenge. .' and part (i) '…due by Jaldi. .'
PROBLEM: Wispr Flow ends each dictation with a full stop. A blank that fails to normalise shows its raw text, and the deed's own punctuation follows it, so the sentence ends up with '. ,' and '. .'. The deed then reads as broken in exactly the places the person needs to look.
FIX: In BlankInput's at-rest display, when `failed` (i.e. showing `blank.raw`), strip trailing sentence punctuation and whitespace for display only: `display.replace(/[\s.।!?]+$/u, '')`. Keep the full raw text in the margin and in the 'heard' editor.
FILES: web/src/editor/BlankInput.tsx

## [should-fix] new-deed | all (failure state; seen on draft 0004 at 1440 and 390, light and dark) | bahi misuse
WHERE: Margin notes beside failed or flagged blanks: 'Couldn't read an amount here. Try 'pachees hazaar' or '25000'.', 'Couldn't read a payment plan…', 'Couldn't read a date here…'
PROBLEM: These error sentences are set entirely in bahi red text (`text-bahi`), although each note already sits beside a bahi rule (`border-l border-bahi`). The rest of the app sets error text in ink beside a red rule (Notice, Field, the HeardForm error, the styleguide's 'Add the name exactly as your bank has it.'), so the editor breaks the house rule exactly where errors matter most.
FIX: In Margin.tsx Note, change the failed, problem and sum paragraphs from `text-bahi` to `text-ink`. The rule stays red and the wavy bahi underline under the blank stays as the mark. Keep `text-bahi` only on the † dagger.
FILES: web/src/editor/Margin.tsx

## [should-fix] new-deed | all (also every published deed, including the styleguide's §9, /d and /a) | wording
WHERE: §5 If things go wrong, first paragraph: 'The parties may end the rest of this deed by agreeing to on Vaada: money for work not yet delivered…'
PROBLEM: A word is missing ('agreeing to on Vaada'), so an operative clause of the contract reads as a typo, and it is unclear what the parties are agreeing to.
FIX: Change it to 'The parties may end the rest of this deed by agreeing so on Vaada: …' (or 'by both agreeing to end it on Vaada'). DeedBody also renders already-published deeds, so record in DECISIONS.md that this is a grammatical fix with no change in meaning.
FILES: web/src/deed/DeedText.tsx

## [should-fix] new-deed | 390 light and dark (also wrong in the publish-error message at every width) | wording
WHERE: Under 'Send to client': the italic line 'Blanks still to fill are noted in the margin.' Also the SendPanel error text '…They're marked in the margin.'
PROBLEM: At 390 there is no margin. The notes sit inline under each paragraph, so the sentence points to something the phone layout doesn't have. It also doesn't say the deed can't go out until those blanks are filled, though the button looks fully enabled.
FIX: Use wording that holds on both layouts: 'Blanks still to fill are marked with a red rule beside their lines; the deed can't go out until they're filled.' Use the same 'marked with a red rule' phrasing in the publish-error sentence.
FILES: web/src/editor/SendPanel.tsx

## [should-fix] new-deed | 390 light and dark (dev and the public demo, where PERSONA_SWITCHER_ENABLED=true) | layout
WHERE: The fixed 'AS ADITI RAO' slip at bottom-left (fixed bottom-3 left-3)
PROBLEM: At 390 the deed text starts about 41px from the screen edge, and the 88×32px slip sits over it. In the full-page shot it covers the left guilloche, the margin rules and the start of a line ('§ 2. The work' is cut to 'e work' on draft 0004). On a real phone it hides the first words of whichever deed line is at the bottom of the viewport while someone is filling blanks.
FIX: Below the md breakpoint, move the persona control out of the reading column: put a 'Personas' link in the demo band or the masthead nav, or dock the slip as a narrow tab on the right edge (`right-0`, rotated label). Keep the floating slip only at md and up, where it sits outside the sheet.
FILES: web/src/app/Shell.tsx

## [should-fix] styleguide | all | wording
WHERE: §9 A published deed, foot of the sheet: 'Not yet accepted.' in italic, with a stamped red 'वादा FUNDED' seal beside it
PROBLEM: The specimen contradicts itself: a deed can't be funded before it is accepted. In the app the seal appears only once payment is captured. The styleguide is the reference for how these states look, so it should show a state that can exist.
FIX: Pass a sample acceptance to the specimen (for example `accepted={{ name: 'Rahul Mehta', email_masked: 'r•••@kilnlabs.in', at: '2026-10-09T10:12:00Z' }}`, so it reads 'Accepted by Rahul Mehta … on …'). Or keep `accepted={null}` and pass `<Seal stamped={false} …/>`.
FILES: web/src/routes/Styleguide.tsx

## [polish] new-deed | all | layout
WHERE: 'Send to client' panel below the sheet: the gold rule above the heading, and the 'SEND THE DEED' button beside the email field
PROBLEM: (a) The rule is `border-t-2 border-double`. At 2px a double border renders as one solid 2px bar, so where the brief asks for double hairlines there is a heavy single gold stripe. (b) The grid uses `sm:items-end`, so the button lines up with the bottom of the hint ('They get a link…') rather than the input's rule. At 1440 the button straddles the email underline (button 291–331px, rule at 306px), which looks misaligned.
FIX: Use `border-t-[3px] border-double` (or put a `rule-double` <hr> above the heading) in both SendPanel and SentPanel. Move the hint out of the grid so `items-end` lines the button up with the input rule; or keep the Field and give the button `self-start mt-[1.6rem]`.
FILES: web/src/editor/SendPanel.tsx

## [polish] new-deed | all | form not document
WHERE: Blanks at rest inside the sentences: 'Aditi Rao , hereinafter', 'organisation , hereinafter', 'the work , in the parts', 'total , in these parts: how it's split .', 'On delivery : amount ,'
PROBLEM: The at-rest blank span has horizontal padding (`px-0.5`) and its underline box ends past the word, so every comma, colon or full stop after a blank floats a few pixels away. Together with the gold dotted underline kept on filled values, this is the main thing that makes a filled deed read as a form with fields rather than one document (the published deed has no such gaps).
FIX: In BlankInput's at-rest span, drop `px-0.5` (move the focus outline offset onto `outline-offset-2` alone). For filled values (not empty, not failed), make the underline much quieter, e.g. `decoration-[color-mix(in_srgb,var(--gold)_35%,transparent)]`, or show it only on hover and focus.
FILES: web/src/editor/BlankInput.tsx

## [polish] new-deed | all (also styleguide §9) | layout
WHERE: Roman sub-clauses under §3: '(i)      Advance: ₹12,500, for two logo directions…' with the continuation line 'Fri 16 Oct 2026.' starting back under '(i)'
PROBLEM: The numeral sits in an inline-block (`min-w-[2.5em]`), which leaves a wide gap after '(i)'. Wrapped lines also return to the left edge instead of hanging under the clause text, so the parts don't read as indented sub-clauses of a deed.
FIX: In DeedBody, give each part's paragraph a hanging indent, e.g. `pl-[2.5em] -indent-[2.5em]` on the text <p>, with the numeral as a `inline-block w-[2.5em] indent-0` span. Or lay the li out as `grid grid-cols-[2.5em_1fr]`.
FILES: web/src/deed/DeedText.tsx

## [polish] styleguide | all (same component as the deal room and the client view /a) | layout
WHERE: §9 published deed, the evidence block under the closing double rule: 'Not yet accepted.', the three disclaimers, 'AGREEMENT HASH 0x…', 'NONCE 0x…', 'VERIFY'
PROBLEM: The wrapper's `space-y-3` does nothing: each child carries `m-0`, which beats Tailwind v4's zero-specificity `:where()` spacing. The acceptance line, the disclaimers and the hash/nonce list therefore run together at plain line spacing; the hash sits about 18px under the last disclaimer, tighter than the gap between the disclaimers themselves.
FIX: In PublishedDeed, drop `m-0` from the <p>, the DeedDisclaimers <ul> and the <dl> inside the `space-y-3` wrapper, or replace `space-y-3` with explicit `mt-3` on the ul and dl (for example DeedDisclaimers taking a className).
FILES: web/src/deed/PublishedDeed.tsx, web/src/deed/DeedText.tsx

## [polish] styleguide | 390 light and dark for the deed foot; 1440 for the slip | layout
WHERE: §9 deed foot at 390: the hash wraps to '…f13aa720' then '495' on its own line, and the nonce leaves a single '8' on its own line. §8 'A slip' at 1440: '0x185fbd' then 'ab7858…' on the next line
PROBLEM: Mono uses `break-all`, so long hex strings break at any character and leave one- to three-character orphans. On the client's phone view (/a at 390, same component) the evidence lines look ragged.
FIX: In PublishedDeed, put each hash on its own line under its label (`dt` as block), and render it in 8-character groups separated by <wbr> (or thin spaces kept out of copy), so lines break only between groups. In the styleguide slip, wrap the shortened hash in `whitespace-nowrap`.
FILES: web/src/deed/PublishedDeed.tsx, web/src/components/ui.tsx, web/src/routes/Styleguide.tsx

## [polish] styleguide | all | wording
WHERE: §3 Figures and marks, 'Parts and rules': 'Parts are numbered I, II, III, IV.'
PROBLEM: The deed itself numbers parts as lower-case '(i)', '(ii)' (DeedText uses `toRoman(i).toLowerCase()`), while buttons and dialogs say 'Approve part I'. The styleguide states a single rule that the main document doesn't follow.
FIX: Either say exactly what is used ('In the deed, parts are (i), (ii), (iii); elsewhere Part I, Part II.') and render both, or make the deed use upper-case '(I)', '(II)' so one rule holds everywhere.
FILES: web/src/routes/Styleguide.tsx, web/src/deed/DeedText.tsx

## [polish] styleguide | all | wording
WHERE: §7 The seal, the left roundel captioned 'Before payment'
PROBLEM: The unstamped ghost seal still prints 'FUNDED' inside it (Seal's `caption` defaults to 'Funded' and is drawn whether or not the seal is stamped), right above the caption 'Before payment'. With no hash the ring text also reads 'VAADA · वादा ·  · VAADA'.
FIX: In Seal, draw the caption text only when `stamped`; when unstamped, show a hairline in its place or the word 'UNSEALED'. In ringText, leave out the empty middle segment when `hash` is null.
FILES: web/src/design/Seal.tsx

## [polish] new-deed | 1440 light and dark (styleguide too) | layout
WHERE: Left edge of the page: the wordmark and footer start at x=168, while 'A NEW DEED' and 'Send to client' start at 144 and the deed sheet at 136. On /styleguide the content starts at 144 against the wordmark's 168
PROBLEM: The masthead and colophon use `max-w-6xl px-6`, but the editor and styleguide use `max-w-[76rem]` with their own padding, so the page body overhangs the header and footer by 24 to 32px on each side. The page's left edge is ragged where a book page would line up.
FIX: Use one page-width token for Shell's masthead/colophon and the page bodies. Either widen the Shell containers to `max-w-[76rem]` with the pages' padding, or have DeedEditor and Styleguide use `max-w-6xl px-4 sm:px-6` and let the sheet bleed with a negative margin if it needs to be wider.
FILES: web/src/app/Shell.tsx, web/src/editor/DeedEditor.tsx, web/src/routes/Styleguide.tsx

## [polish] styleguide | print (A4) | print
WHERE: '§ 5. A struck clause' is the last line of printed page 2 and '§ 8. Sheets' the last line of page 3; their content starts on the next page
PROBLEM: Section headings are left orphaned at the foot of a page. The same SectionMark heads every deed, so a printed deed can strand a '§ n.' heading the same way.
FIX: In the print block of index.css add `h2, .deed h2 { break-after: avoid; }` (or `break-after-avoid` on SectionMark), and `break-inside: avoid` on the Para wrapper for short paragraphs.
FILES: web/src/styles/index.css, web/src/components/ui.tsx

## [polish] new-deed | all | wording
WHERE: Margin labels and strike links: 'THE WORK YOU'LL DELIVER' and 'Your name' (second person) next to 'WHAT THE MAKER KEEPS RIGHTS TO' (third person, with placeholder 'what you keep'); 'STRIKE THE ORGANISATION' listed under 'OPTIONAL CLAUSES'
PROBLEM: The labels switch between 'you' and 'the Maker' blank to blank. 'Strike the organisation' names something that isn't a clause: it removes the words 'of [their organisation]'. These are small, but they make the margin read as assembled rather than written.
FIX: Pick the second person for the Maker's own labels ('What you keep the rights to'), and rename the toggle to 'Strike "of their organisation"' (restore: 'Restore the organisation'), or move that toggle out of the 'Optional clauses' list.
FILES: web/src/deed/blanks.ts, web/src/editor/Margin.tsx

## [polish] styleguide | all | layout
WHERE: Gap between the end of §3 (the amounts table) and '§ 4. Blanks' is about 110px against about 70px elsewhere; 'STAMP IT AGAIN' sits about 10px above the seal captions' baseline at 1440, and at 390 it is indented 16px by its button padding
PROBLEM: Each Specimen has `mb-10` inside a grid that also has `mb-10`, so the margins add up. The quiet button's padding throws its text off the content edge. The spacing rhythm is uneven on the page that defines it.
FIX: Drop `mb-10` from Specimen when it is inside the §3 grid (use `mb-0` on the last one, or `gap` only). Give the 'Stamp it again' button `px-0` and put it in the figure row with `self-center`, or under the funded seal.
FILES: web/src/routes/Styleguide.tsx

## [polish] new-deed | 1440 dark and 390 dark (light shows plain native radios too) | dark-theme contrast
WHERE: Colophon theme switch: 'MATCH DEVICE · LIGHT · DARK'
PROBLEM: These are native radio inputs. In dark mode the unchecked ones render as grey OS discs and the checked one as a bright cream disc, which is browser chrome sitting on the lamp-lit paper. It is the one control on the page that doesn't look like the rest of the paperwork.
FIX: Style the radios to match: `appearance-none size-3 rounded-full border border-ink-soft checked:bg-ink` plus a focus ring. Or drop the dots and render three small-caps words with the current one underlined in ink (`aria-pressed` buttons or a radiogroup).
FILES: web/src/app/Shell.tsx

CLEAN: []
==========
