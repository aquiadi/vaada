========== room
## [should-fix] deal-room, deal-room-client | all | form not document
WHERE: The deed, § 2 second paragraph ("except Drafts aur jo concepts use nahi hue") and § 3 sub-clauses (i) and (ii) ("for Do logo directions aur mood board", "for Final logo files SVG PNG mein")
PROBLEM: Filled values keep the capital letter Wispr Flow puts at the start of every dictation, so capitals land in the middle of sentences. The deed then reads as form fields pasted into a template, not one document. The cause: milestone deliverables and the IP exclusions use blank kind "text". That kind only trims trailing punctuation. Unlike work(), it never runs undoWisprFormatting or lowercases the first word.
FIX: Add a sentence-slot kind, for example "phrase", for milestones.N.deliverables and ip_transfer.exclusions. It should run undoWisprFormatting and lowercase the first word. Base it on a reversed version of work()'s rule: lowercase the first word unless it is all capitals, mixed case, or matches the maker's, client's or organisation's name. That catches "Final" and "Drafts", which the current SENTENCE_STARTERS list misses. Published deeds are frozen and hashed, so this applies to new deeds. Re-word the seed data so the demo deed reads correctly.
FILES: web/src/deed/blanks.ts, web/src/normalize/text.ts, web/src/normalize/text.test.ts

## [should-fix] deal-room, deal-room-client | all (most visible at 390) | layout
WHERE: § 3 The money, the roman sub-clauses (i) Advance and (ii) On delivery
PROBLEM: The numeral sits in an inline-block with min-width 2.5em plus a right margin, so a tab-sized gap follows "(i)". Wrapped lines then run back to the left edge, under the numeral. At 1440 "5 Oct 2026." starts under "(i)", and at 390 two whole lines do. Sub-clauses in a deed should hang. Here the numerals don't stand out and the left edge looks ragged.
FIX: Give Para a className prop. Set the milestone paragraphs to a hanging indent (pl-[2.5em] -indent-[2.5em]), or make each <li> a grid-cols-[2.5em_minmax(0,1fr)] row with the numeral in its own cell. Drop the extra mr-1 gap. Check the editor at /new too, where the same Para also carries the margin column.
FILES: web/src/deed/DeedText.tsx

## [should-fix] deal-room, deal-room-client | 1440 light, 1440 dark | layout
WHERE: The whole deed sheet, from "In short" down to the seal
PROBLEM: On a read-only deed the margin column is dropped, but the sheet still spans the full 6xl container. The text keeps to 68ch on the left, about 620px of a 1100px sheet. The right third of the sheet is empty paper for its whole height, while the gold double rules and the seal run out to the far right. The biggest object on the page looks lopsided, like an editor whose marginalia went missing.
FIX: When slots.margin is null, set the deed's column centred in the sheet: wrap the In short, body and foot of PublishedDeed in a mx-auto max-w-[68ch] column (the double rules included, so they match the text). Keep the seal inside that column's right edge. Alternatively, cap the sheet in DealRoom (and on /a/) at about 56rem, the measure plus the guilloche padding.
FILES: web/src/deed/PublishedDeed.tsx, web/src/deed/DeedText.tsx, web/src/routes/DealRoom.tsx

## [should-fix] deal-room, deal-room-client | print (A4 PDF via page.pdf with media=print; dark prints in the light palette, as intended) | print
WHERE: Page 1 foot and page 4 head of the printed deal room
PROBLEM: Printed to A4 the room runs to 4 pages and breaks badly. "§ 3. The money" sits alone at the bottom of page 1, with its clause on page 2. "Revisions: 0 of 3 used." sits alone at the top of page 4, cut off from the ledger it belongs to. No break-inside, break-after or @page rule exists anywhere in web/src, so milestone entries, register rows, money rows and the acceptance block can all split across pages.
FIX: In the @media print block, add: h2, h3 (SectionMark and the section headings) { break-after: avoid }; the milestone <li>, register <li>, money <tr> and the deed's acceptance/evidence block { break-inside: avoid }. Add an @page { margin: 16mm } as well. Move the Revisions line into the ledger's last row or a ledger foot so it can't be stranded.
FILES: web/src/styles/index.css, web/src/components/ui.tsx, web/src/room/MilestoneLedger.tsx, web/src/room/Register.tsx, web/src/room/MoneyAccount.tsx, web/src/deed/PublishedDeed.tsx

## [should-fix] deal-room, deal-room-client | print (production registry; code-confirmed, dev shows the local-chain variant) | print
WHERE: Deed foot ("Recorded on…") and the Funded / Delivered / Released lines of each milestone
PROBLEM: RegistryLink prints nothing anyone can look up. In production it renders only the anchor text "On Polygonscan", so on paper the transaction id is gone. In dev it shows a 10-character prefix plus an ellipsis. Verify is no-print, so the printed deed and ledger carry five registry references that can't be checked. That defeats the point of the registry on paper.
FIX: Next to each RegistryLink, add a print-only span with the full tx hash in Plex Mono (break-all), for example <span className="hidden print:inline font-mono text-micro">{entry.tx_hash}</span>. Alternatively, mark the anchors data-registry and print the URL with a[data-registry]::after { content: " " attr(href) } under @media print.
FILES: web/src/deed/PublishedDeed.tsx, web/src/styles/index.css

## [should-fix] deal-room, deal-room-client | all | wording
WHERE: The register entries "Milestone I/II delivered. Disputes close 15 Oct 2026, 21:46 IST; the money releases…", and the effect sentence behind the Raise a problem button
PROBLEM: The same window has four names on one page: "Disputes close" in the register, "in review until" in the ledger, "review period… raise a problem" in the deed, and "Raise a problem" on the button. "Disputes close" also reads as though disputes are being closed or settled.
FIX: Say it the way the deed does. Register: "Milestone II delivered. Review ends 15 Oct 2026, 21:46 IST; if no problem is raised, the money releases 16 Oct 2026, 21:46 IST." Dispute effect: "…You can raise a problem until 15 Oct 2026, 21:46 IST."
FILES: api/vaada/money/delivery.py, api/vaada/views.py

## [should-fix] deal-room-client | all | wording
WHERE: What happened today?, the placeholder in the blank
PROBLEM: The placeholder is the Maker's sentence for both roles. Rahul, the Client, sees "Milestone do ho gaya, final files Drive pe daal di…", which only Aditi could say. The example teaches the client the wrong kind of update.
FIX: Make the placeholder depend on room.role. For example, client: "Pehla part dekh liya, theek hai; logo mein ek revision chahiye…"; maker: keep the current line.
FILES: web/src/room/VoiceUpdates.tsx

## [polish] deal-room, deal-room-client | all | wording
WHERE: Milestone II, the Releases line: "about 16 Oct 2026, 21:46 IST, unless a problem is raised"
PROBLEM: "about" next to a time given to the minute contradicts itself. The register states the same moment flatly ("the money releases 16 Oct 2026, 21:46 IST").
FIX: Drop "about" so the ledger matches the register ("16 Oct 2026, 21:46 IST, unless a problem is raised first"). If you want to keep the hedge, drop the minute instead ("about 16 Oct 2026, late evening").
FILES: web/src/room/MilestoneLedger.tsx

## [polish] deal-room-client | all | wording
WHERE: Milestone I standing ("Released for the next settlement") and The money, the "Released for the next settlement" row
PROBLEM: "Next settlement" is the Maker's bank-side jargon, and it is shown to the Client. It is also stale: on 11 Oct it still describes a release from 3 Oct as waiting for the next settlement. The register words the same fact differently ("₹12,500 released to Aditi Rao, queued for the next settlement").
FIX: Make milestoneStanding and the money row depend on the reader's role. Client: "Released to Aditi". Maker: "Released; reaches your bank on Razorpay's next settlement".
FILES: web/src/room/words.ts, web/src/room/MoneyAccount.tsx

## [polish] deal-room, deal-room-client | all | layout
WHERE: Deed foot: the "Accepted by…" line, the three disclaimers, and the agreement hash and nonce
PROBLEM: The block is meant to be spaced with space-y-3, but Tailwind v4's space-y selector is :where(...), which has zero specificity, so each child's .m-0 wins. The acceptance line, disclaimers and hash/nonce stack with no gap: AGREEMENT HASH sits about 19px under the last disclaimer, tighter than the disclaimers sit to each other. The evidence reads as crammed onto the end of the list.
FIX: Use flex flex-col gap-3 on that wrapper div instead of space-y-3 (or remove m-0 from the <p>, the DeedDisclaimers <ul> and the <dl>).
FILES: web/src/deed/PublishedDeed.tsx, web/src/deed/DeedText.tsx

## [polish] deal-room, deal-room-client | 390 light, 390 dark (and the narrow print) | layout
WHERE: Deed foot, AGREEMENT HASH and NONCE values
PROBLEM: The 66-character hash wraps to leave "ac9" alone on the third line, and the nonce leaves a single "c" on its own line. That is an orphaned character in the evidence people copy and compare.
FIX: Put each value on its own line under its label and set it in 8-character groups separated by thin spaces, so it can only break between groups. Keep the raw value for copying (user-select / a copy control). Or use a block with break-all and max-w-[34ch], so it splits into even halves.
FILES: web/src/deed/PublishedDeed.tsx

## [polish] deal-room, deal-room-client | 1440 light/dark ("order.", "IST."), 390 light/dark (split dates) | layout
WHERE: The register: its note under the heading, and entry summaries
PROBLEM: Orphans and split dates. At 1440 "order." sits alone under "Everything that has happened on this deed, in", and "IST." sits alone at the end of the Milestone II entry. At 390 dates break across lines ("Disputes close 7 / Oct 2026").
FIX: Use non-breaking spaces inside "15 Oct 2026" and before "IST" in both ist_moment (API summaries) and formatInstantIst (web). Keep the ", " that Register.dayAndTime splits on. Add text-wrap: pretty to the register note and summaries.
FILES: api/vaada/format.py, web/src/format/dates.ts, web/src/room/Register.tsx

## [polish] deal-room, deal-room-client (site-wide) | 1440 dark, 390 dark (native white discs in light) | contrast
WHERE: Footer, the Match device / Light / Dark radios
PROBLEM: The radios are the browser's native controls. In dark the unchecked ones render as flat grey filled discs, a leftover browser default that matches nothing else on the lamp-lit page. accent-color only styles the checked state.
FIX: Use appearance-none with a 12px circle: 1px ink-soft border on transparent, an inner ink dot when checked (a radial background or ::before), and the red focus ring from :focus-visible.
FILES: web/src/app/Shell.tsx

## [polish] deal-room, deal-room-client (site-wide) | all (clearest at 390) | layout
WHERE: Between the end of What happened today? and the footer rule
PROBLEM: <main> carries the .grain texture, but the footer's mt-16 margin shows the flat body colour. That leaves a 64px ungrained band above the footer rule, a visible seam in the paper (230,221,201 grained against 233,224,204 flat in light).
FIX: Replace the footer's mt-16 with pb-16 on <main> so the grained area runs to the rule, or put .grain on the body.
FILES: web/src/app/Shell.tsx

CLEAN: []
========== client
## [should-fix] client-deed-paid | all (1440/390, light/dark) and print | dashboard-ism
WHERE: The 'Paid, and held by Razorpay' slip under the deed: the bahi seal sits in its own boxed card beside a status heading and a button
PROBLEM: The notary's seal is not on the deed. It sits in a separate card under the sheet, like a success badge beside a status line. That is a dashboard pattern, and it means the printed or saved deed carries no seal. The deal room already stamps the same Seal at the deed's foot (PublishedDeed's `seal` prop, DealRoom.tsx:132), so the two screens disagree about where the seal goes.
FIX: In ClientDeed, when stage === 'paid', pass `seal={<Seal hash={deed.agreement_hash} caption="Funded" animate={stampedHere} />}` to <PublishedDeed> so the seal is pressed beside 'Accepted by Rahul Mehta…'. Shrink Receipt to a plain slip with one sentence and the deal-room link (no Seal), or drop it into the page lede. Keep focusOnMount on the heading for the stamp moment.
FILES: web/src/routes/ClientDeed.tsx, web/src/deed/PublishedDeed.tsx, web/src/design/Seal.tsx

## [should-fix] client-deed | all, including print (still present in current code) | wording
WHERE: §3 The money, first sentence and the roman sub-clauses: 'in these parts: On delivery.' / 'in these parts: Advance and On delivery.' / '(i) Advance: ₹12,500, for Do logo directions aur mood board, due by…'
PROBLEM: The deed's key money sentence reads wrong. A one-part deed says 'in these parts: On delivery.', which is plural with a single item, and then repeats 'On delivery' in (i). With two parts, 'Advance and On delivery' has a capital 'On' mid-sentence. Each sub-clause splices the raw deliverable after 'for', which gives 'for Do logo directions…' and 'for Final logo files…' with capitals mid-sentence. This is the document people sign, and it stops reading like formal English at the money clause.
FIX: In DeedText.tsx build the sentence from the count: 'in one part, as follows:' or 'in two parts, as follows:' (numberWord(milestoneCount)). Drop the titles list from the published sentence (valueOf('plan') in PublishedDeed.tsx), or set the titles in quotes. Reorder each sub-clause so the free text follows a colon, where a capital is natural: '(i) Advance, ₹12,500, due by Mon 5 Oct 2026: Do logo directions aur mood board.' The editor's plan blank can stay as it is. Before launch this is still covered by the in-place correction noted in DECISIONS.
FILES: web/src/deed/DeedText.tsx, web/src/deed/PublishedDeed.tsx

## [should-fix] client-deed | all, including print | layout
WHERE: §3 roman sub-clauses (i), (ii): the second line of each part
PROBLEM: The numeral is an inline-block span, so wrapped lines run back under '(i)' rather than hanging. The text after the numeral starts at about x=347 at 1440, and the continuation line starts at the numeral's x=298. At 390 the (i) clause wraps three times under its numeral. This is ragged alignment in the most-read clause.
FIX: Give the milestone Para a hanging indent: wrap the numeral and text in a `grid grid-cols-[2.5em_1fr]` (numeral in column 1, sentence in column 2), or put `pl-[2.75em] -indent-[2.75em]` on the <p> and drop min-w on the numeral span.
FILES: web/src/deed/DeedText.tsx

## [should-fix] client-deed | 390 light/dark, and the A4 print of both client routes | layout
WHERE: Deed foot evidence block: 'AGREEMENT HASH 0xe295…' and 'NONCE 0x08f8…'
PROBLEM: The label is inline and the Mono value uses break-all, so at 390 the hash breaks into three lines that end in an orphan '3f4'. On the paid deed it ends in 'ac9', and the nonce leaves a single 'c' or '2' on its own line. The A4 PDF leaves 'f4' and 'c9' orphans too. The hash label also sits tight under the disclaimer list with no gap.
FIX: In PublishedDeed.tsx render each dt/dd as a block (label on its own line, value under it) and add `mt-3` before the <dl>. The 34-character nonce then fits on one line at 390, and the 66-character hash wraps into two even lines instead of leaving a 2–3 character orphan.
FILES: web/src/deed/PublishedDeed.tsx, web/src/components/ui.tsx

## [should-fix] client-deed | print (checked with emulateMedia print and an A4 PDF) | print
WHERE: Page header lede and the paid receipt slip
PROBLEM: Printed, the unaccepted deed still opens with 'accept it and pay at the foot of the page', but the pay slip is no-print, so the paper has no foot to pay at. The paid deed prints a black 'OPEN THE DEAL ROOM' button inside the receipt slip, and the line 'The deal room shows where the rest went.' The paper also carries no link back to the online deed. Verify is no-print, and the registry line keeps a truncated tx hash ('0x48ea442b…') that nobody can check from paper.
FIX: Add `no-print` to the lede <p> when stage is accept or pay, and swap in a print-only line (`hidden print:block`): 'Deed No. 0003, sent by Aditi Rao. Read and accept it at vaada…/a/<slug>.' Add `no-print` to the ButtonLink in Receipt. In print, show the full tx hash, or the deed URL with 'Verify at', in place of the truncated one.
FILES: web/src/routes/ClientDeed.tsx, web/src/deed/PublishedDeed.tsx, web/src/styles/index.css

## [should-fix] client-deed-paid | all (current code still has it) | wording
WHERE: Receipt slip text: 'Razorpay holds ₹12,500 and releases it to Aditi one part at a time, as each is delivered and approved. The deal room shows where the rest went.'
PROBLEM: This contradicts the corrected lede directly above it ('as you approve each part or its review period ends') and the deed's §4, where money releases on approval or when review lapses, not only on approval. 'Where the rest went' sounds as if money went missing, when ₹12,500 was in fact released to Aditi. With one part left, 'one part at a time' is also wrong. The slip never says what the client actually paid (₹25,605 on 29 Sep).
FIX: In holding(): 'You paid ₹25,605 on 29 Sep 2026. ₹12,500 has been released to Aditi; Razorpay holds the other ₹12,500 until you approve that part or its review period ends.' Compute released from milestones, and use the singular phrasing when one part remains.
FILES: web/src/routes/ClientDeed.tsx, web/src/room/words.ts

## [should-fix] client-deed | all | wording
WHERE: 'What you'll pay' slip, last note: 'If a part isn't delivered within three days of its date, you can ask for that part back.'
PROBLEM: 'Ask for that part back' says the client gets a part back. The deed says the client may ask for that part's money back. 'Within three days of its date' is also looser than the deed's 'within three days after its due date'. Next to a money breakdown, this is the sentence that has to match the deed exactly.
FIX: Change it to: 'If a part isn't delivered within three days after its due date, you can ask for that part's money back; the processing fee isn't refunded.'
FILES: web/src/room/FeeBreakdown.tsx

## [should-fix] maker | all, and print | wording
WHERE: Under the name: 'A Maker on Vaada since the 11th day of October, 2026'
PROBLEM: The certificate contradicts itself. It says Aditi joined on 11 Oct 2026, then lists milestones released on Sun 6 Sep, Sun 27 Sep and Sat 3 Oct. `since` is users.created_at (api/vaada/routes/public.py:150), and seed.py creates the personas before it winds the clock back 40 days. Every demo visitor sees a public proof document that is wrong on its face.
FIX: In seed.py, create the personas (the _user calls) after `_set_offset(ctx, home - timedelta(days=40))`, or set created_at from ctx.clock.now() at that point. As a guard, have public.py return min(created_at, earliest published_at of the maker's deeds) as `since`.
FILES: api/vaada/seed.py, api/vaada/routes/public.py, web/src/routes/Maker.tsx

## [should-fix] maker | all, and print | wording
WHERE: 'How to check this': '…and the link beside each line opens that record.'
PROBLEM: No line has a link. On the local chain, RegistryLink renders plain text, 'Recorded on the local chain 0x7ed355b6…', and on paper there are no links at all. The sentence promises a check the page doesn't offer. The brief asks for each milestone to be linked to its registry event.
FIX: Say 'the link beside each line' only when some milestone has registry.tx_url. Otherwise write 'the transaction beside each line is that record'. For the local chain, show the full tx hash (Mono, break-all) rather than 10 characters and an ellipsis, so it can be looked up.
FILES: web/src/routes/Maker.tsx, web/src/deed/PublishedDeed.tsx

## [should-fix] maker | 390 light/dark | layout
WHERE: Each milestone row in 'The milestones, latest first'
PROBLEM: Each whitespace-nowrap chunk carries its own trailing '·', so at 390 every row breaks into three lines: 'Deed No. 0002 ·' / 'Milestone I ·' / 'released Sat 3 Oct 2026 ₹12,500'. Each line ends in a dangling middot, and the amount drops to the third line. The 64-character deed hash under it then wraps into three lines with an orphan 'dac9' or '23ed'.
FIX: In MilestoneLine, put 'Deed No. 0002 · Milestone I' and the amount on the first line, and 'Released Sat 3 Oct 2026' on a second line as text-note text-ink-soft. Move the separators outside the nowrap spans, or drop them. Show the deed hash once per deed, not once per milestone.
FILES: web/src/routes/Maker.tsx

## [polish] client-deed | 1440 light/dark (both client routes) | layout
WHERE: Deed sheet vs. the slip below it
PROBLEM: A read-only deed has no marginalia, but the sheet stays max-w-5xl. The 68ch text fills the left two-thirds, the right ~220px of the sheet is empty, and the double gold rules run the full width past the text. The slip under it is max-w-2xl and centred. That leaves three unrelated left edges (header x=232, deed text x=298, slip text x=416), and nothing lines up.
FIX: For PublishedDeed on ClientDeed, narrow the sheet to the measure (for example max-w-3xl, centred) so the text fills it and the rules match the text. Give the slip the same width as the sheet so their edges align.
FILES: web/src/routes/ClientDeed.tsx, web/src/deed/PublishedDeed.tsx, web/src/design/DeedSheet.tsx

## [polish] client-deed | all | wording
WHERE: Deed body and deed foot (straight quotes), against the page lede, pay slip and maker certificate (curly quotes)
PROBLEM: The deed itself uses typewriter apostrophes: 'gateway's', 'Maker's', 'Razorpay's', 'part's', 'isn't', 'Vaada's', 'don't'. The text around it uses typographic ones ('it’s', 'you’ll', 'Razorpay’s', 'Vaada’s records'). The site footer repeats the deed's first disclaimer with different punctuation ('…agreed and isn't a lawyer' vs '…agreed, and isn't a lawyer').
FIX: Use ’ throughout DeedText.tsx (body and DeedDisclaimers) and Shell.tsx:124, and make the footer sentence match the deed's wording.
FILES: web/src/deed/DeedText.tsx, web/src/app/Shell.tsx

## [polish] client-deed-paid | all | stamp paper
WHERE: The seal roundel
PROBLEM: At size 148 the ring text renders at about 7px and can't be read. The string ('VAADA · वादा · 0x8830078d…b466dac9 · VAADA · वादा · ') covers only about four-fifths of the ring, so there is a lopsided gap with stray dots at the bottom. A real seal's legend closes the circle.
FIX: In Seal.tsx, set textLength to the path length (2π·(r−9)) with lengthAdjust='spacing' so the legend closes evenly. Drop the doubled 'VAADA · वादा' repeat in favour of one legend plus the hash. Render at least 168px wherever the seal is the focal point.
FILES: web/src/design/Seal.tsx

## [polish] client-deed | all (also maker and client-deed-paid) | layout
WHERE: Between the last sheet or slip and the footer rule
PROBLEM: main.grain stops, and the footer's mt-16 margin shows ungrained paper-deep before the footer's top rule. The result is a visible 64px band with a hard tone change, clearest in dark mode at 1440 and at 390.
FIX: Move the spacing inside the grain: replace the footer's mt-16 with pb-16 on <main id="main">, or put the grain on the shell wrapper so main and footer share it.
FILES: web/src/app/Shell.tsx

## [polish] client-deed | all (also maker and client-deed-paid); dark is most visible | layout
WHERE: Site footer: the Match device / Light / Dark theme control, and the legal nav at 390
PROBLEM: The theme control is native radio inputs with accent-color. In dark mode the unchecked ones are the browser's grey filled discs, the one leftover stock form widget on a page that is otherwise paper. At 390 the legal nav wraps with 'PRICING' alone on the second line.
FIX: Style the radios as small-caps text options, with the current choice marked by an ink underline or a 1px ruled box (appearance:none plus a drawn ring if radios stay). Tighten the nav gap at 390 (gap-x-4), or let it wrap in two balanced rows.
FILES: web/src/app/Shell.tsx

## [polish] client-deed | all, and print | form not document
WHERE: Struck clauses (IP transfer, late fee, kill fee): empty blanks drawn as '________'
PROBLEM: Empty blanks inside struck clauses are typed underscores, which render as a broken dashed line with gaps. The rest of the deed's blanks are drawn rules.
FIX: In agreementSlots, render a struck empty blank as `<span aria-hidden className="inline-block w-[4.5em] border-b border-current align-baseline" />`, a continuous rule like a blank on paper.
FILES: web/src/deed/PublishedDeed.tsx

## [polish] client-deed | print (A4 PDF) | print
WHERE: Deed sheet across page breaks
PROBLEM: The guilloche frame is one SVG for the whole tall sheet. On A4, page 1 has a top band and no bottom, page 2 has only side bands, and page 3 has the bottom band. Printed, it reads as one long scroll sliced at arbitrary places, not paged sheets.
FIX: In @media print, hide the SVG frame and give .sheet a CSS double rule border in stamp green with `box-decoration-break: clone`, so every printed page gets a closed frame. Keep the denomination panel on page 1 only.
FILES: web/src/design/DeedSheet.tsx, web/src/styles/index.css

## [polish] maker | all | wording
WHERE: Opening paragraph: 'has completed 3 milestones under 2 deeds … has been released to them for settlement.'
PROBLEM: The certificate is written in formal prose and spells out amounts in words, but it states counts as bare digits. The deed itself says 'two rounds' and 'five days'. 'For settlement' is bank jargon.
FIX: Use numberWord() for counts under 100 ('three milestones under two deeds'), and end with '…has been released to her bank account' (or 'to them') without 'for settlement'.
FILES: web/src/routes/Maker.tsx

CLEAN: ["No route is clean as a whole. These question-level checks found nothing on client-deed, client-deed-paid or maker:", "Q2 bahi red: on all three routes, in both themes, red appears only in the seal and the focus ring. No red text, and the verify-mismatch note is ink beside a bahi rule.", "Q5 stamp paper: on all three routes, the panel carries only 'VAADA \u00b7 \u0935\u093e\u0926\u093e' plus 'DEED No. 000n' or 'CERTIFICATE'. There is no emblem, no 'India Non Judicial', no 'Government of', no state name and no denomination. The deed foot says 'This deed is not stamped under the Indian Stamp Act.' on screen and in print.", "Q3 one document: the published deed's filled values are set in the deed serif in ink, with no input chrome; it reads as one document.", "No horizontal scroll at 390 on any route, checked with scrollWidth == clientWidth on the current build.", "Already fixed after the pass1 screenshots, so not reported: the accept lede ('until the work is delivered'), the paid lede, 'agreeing to on Vaada', and 'each part goes' on one-part deeds. The current build renders all four correctly."]
========== books
## [must-fix] ledger | print (1440 screen width, A4 PDF via the print pipeline); screen variants unaffected | print
WHERE: Foot of every printed page of the ledger table: the <tfoot> row 'Balance as of today ₹12,500 / ₹30,500'
PROBLEM: Chrome repeats <tfoot> at the bottom of every printed page. On A4, page 1 stops after the 21 Sep entry and ends with 'Balance as of today ₹12,500 / ₹30,500'. The entries above it actually add up to ₹18,000 held and ₹9,000 released. On paper, an accountant reads a closing balance under page 1 that contradicts the rows above it. Page 2 ends with the same row again. The filtered views do the same thing with both 'Totals of these entries' and 'Whole ledger, as of today'.
FIX: Print the totals once, at the end. Either move the FootRow(s) out of <tfoot> into a final <tbody className="ledger-foot">, or add `@media print { tfoot { display: table-row-group; } tr { break-inside: avoid; } }` to index.css. The thead may keep repeating, which is correct. If per-page subtotals are wanted later, label them 'Carried forward' with the running held_balance_paise / received_total_paise of the last row on that page. Never repeat the final balance.
FILES: routes/Ledger.tsx, styles/index.css

## [should-fix] ledger | print; also on screen for the 'as of today' wording (all) | print
WHERE: Page header ('Bahi-khata / Your ledger / Razorpay holds ₹12,500 in trust for you') and the foot row 'Balance as of today'
PROBLEM: The masthead and colophon are no-print, so a printed ledger has no Vaada mark, no account holder's name and no print date. It says only 'Your ledger', 'for you' and 'Balance as of today'. On a sheet handed to an accountant or kept for a tax return, 'today' has no date and 'you' has no name. The printed /deeds ('Every deed you are party to') and /admin pages have the same gap.
FIX: Add a print-only provenance line under the PageHeader, for example `<p className="hidden print:block label">Vaada · ledger of Aditi Rao · printed 11 Oct 2026, 21:46 IST</p>`, built from useMe() and the clock. A small `hidden print:block` wordmark in Shell.tsx would cover every page. Change 'Balance as of today' / 'Whole ledger, as of today' to 'Balance on 11 Oct 2026' (today's IST date via formatIsoDate), on screen as well as on paper.
FILES: routes/Ledger.tsx, app/Shell.tsx, components/ui.tsx

## [should-fix] ledger | all | wording
WHERE: Jama column header subtitle 'RECEIVED' (thead), and the CSV column 'Received (INR)'
PROBLEM: The paragraph right above the sheet says 'Jama is money released to you. Released means it is queued for Razorpay's next settlement, which reaches your bank … within a few working days', and each such row reads 'Released for settlement'. The column that holds those amounts is labelled 'received', and the CSV a freelancer gives their accountant says 'Received (INR)'. The page calls the same money released in one place and received in the next, and for tax that difference matters.
FIX: Label the column 'released to you' (thead span in LedgerTable) and rename the CSV header to 'Released to you (INR)' in as_csv. Update the ledger_view.py docstring '(received)' to match. Keep the received_paise field name internally if a rename is too wide.
FILES: routes/Ledger.tsx, /home/user/vaada/api/vaada/ledger_view.py

## [should-fix] ledger | 390 light and dark | layout
WHERE: The ledger sheet: the column header row and every entry row
PROBLEM: At 390 the Particulars column is about 145px wide, squeezed by the 84px Amanat and 80px Jama columns. Each entry wraps to 5–7 lines: 'Deed No. 0001 · / Milestone II, On / delivery · Meenal / Joshi', with lines starting on a bare '·'. Eleven entries make a 3,200px page. The header is ragged: 'held in trust' wraps to two lines and 'received' does not, so with align-bottom the word 'Amanat' sits about 22px above 'Jama'.
FIX: Below sm, either (a) drop the two amount columns and print the amount under the particulars, right-aligned and labelled ('Amanat ₹9,000' / 'Jama ₹9,000'), keeping the column table from sm up; or (b) narrow the amount columns to about 4.5rem and shorten the meta line on phones to 'No. 0001 · II · Meenal Joshi', with whitespace-nowrap on 'Deed No. 0001' and on the client name. For the header, use one-line labels ('in trust' / 'released') or give both label spans the same fixed two-line height, so 'Amanat' and 'Jama' share a baseline.
FILES: routes/Ledger.tsx

## [polish] ledger | all | layout
WHERE: Tue 1 Sep (Deed 0001) and Tue 29 Sep (Deed 0002): two 'Held by Razorpay' rows at the same minute
PROBLEM: Within the same timestamp, Milestone II is listed before Milestone I on both deeds. The tie-break is LedgerEntry.id, a random UUID, so the order is effectively random. A bookkeeper reading the ditto rows expects I before II.
FIX: In entries(), order by (LedgerEntry.created_at, Milestone.idx.nulls_first(), LedgerEntry.id).
FILES: /home/user/vaada/api/vaada/ledger_view.py

## [polish] ledger | all | wording
WHERE: The filter and CSV strip above the sheet, the table caption, and each row's time
PROBLEM: IST is stated three times on one screen: 'Times are in IST.' under the CSV button, 'Times are Indian Standard Time.' in the caption, and '21:46 IST' on every row. Separately, the filter is called 'Open deeds' while /deeds calls the same deeds 'Under way', so a reader can't tell whether the two are the same set.
FIX: Keep the caption sentence and drop 'Times are in IST.' from the CSV note ('Every entry, for your accountant or your tax return.'). Drop the ' IST' suffix from the per-row time on wide screens, where the caption covers it. Rename the filter to 'Under way' to match the index.
FILES: routes/Ledger.tsx

## [should-fix] admin | 390 light and dark | layout
WHERE: § 8 'Refund windows on paid deeds (1)' table (and every other DeskTable when it has rows)
PROBLEM: DeskTable forces min-w-[52rem] (832px) inside an overflow-x frame, even for this four-column table. At 390 the Paid value is cut mid-glyph ('29 Sep 2026, 2'). The 'Refund window closes' column, the deadline the section is sorted by and the reason it exists, is entirely off-screen. Nothing signals that the frame scrolls; the clipped glyph is the only cue.
FIX: Give DeskTable a minWidth prop sized per table: none for the 4-column refund-windows table, which fits 358px once the dates wrap, and 52rem only for the 8-column disputes table. Alternatively, below sm, render each row as a stacked <dl> with the deadline first. For tables that must scroll, add a visible cue: a right-edge paper-deep fade, or a label 'Scroll sideways for the deadline'.
FILES: books/DeskTable.tsx, routes/Admin.tsx

## [polish] admin | print; 1440 light and dark for the spacing | print
WHERE: § 8 table on paper, and the page as a whole
PROBLEM: Printed, the queue carries no 'as of' time, so a printout of what needs a person has no date. The single table row splits across pages: 'No. 0002 … 23 Mar 2027' on page 1, and its id 'ad45dec3' alone on page 2 under a repeated header. On screen at 1440 the four-column table stretches across 1104px, leaving a roughly 360px-wide Paid column and a large gap before the deadline. When all is quiet, seven empty sections take about 700px for one italic line each. That is plain, but not the dense office ledger the brief asks for.
FIX: Add `tr { break-inside: avoid; }` to the @media print block in index.css. Add 'As of 11 Oct 2026, 21:46 IST' (the queue's fetch time) to the 'Signed in as…' line. Let narrow DeskTables size to content (w-auto, or explicit column widths). Optionally set the empty sections as a compact two-column register (§ title | 'none open'), so the all-clear state fits in one view.
FILES: styles/index.css, routes/Admin.tsx, books/DeskTable.tsx

## [should-fix] outbox | all | wording
WHERE: Lede 'None of them left this machine.' and the end of every row's meta line '· sent'
PROBLEM: The page says no letter left, and then every one of the 19 rows is marked 'sent'. The raw EmailStatus value is printed as-is. In the demo, 'this machine' is a server the visitor never sees, so they may read it as their own computer.
FIX: In DevOutbox.tsx, map the status to words: sent → 'kept here', queued → 'waiting', failed → 'failed'. Reword the lede to 'Every letter Vaada would have sent, newest first. In development and the demo, letters are kept here instead of being emailed.'
FILES: routes/DevOutbox.tsx

## [polish] outbox | all (dates); 390 light and dark (wrap) | other
WHERE: Timestamp in every row's meta line
PROBLEM: All 19 letters are stamped '11 Oct 2026, 21:46 IST', but the ledger and admin show the same events from 1 Sep to 10 Oct. For example, 'Meenal Joshi accepted Deed No. 0001' is dated 11 Oct, while her money was held on 1 Sep. OutboundEmail.created_at uses the database's now(), not the travelling clock that seed and 'Let time pass' move, so the dispatch register disagrees with every other record in dev and demo. At 390 the stamp also breaks between '21:46' and 'IST'.
FIX: When queuing a letter in api/vaada/email/outbox.py, set created_at=ctx.clock.now() explicitly; the server_default can stay as a fallback. In DevOutbox.tsx, wrap formatInstantIst(...) in <span className="whitespace-nowrap">.
FILES: /home/user/vaada/api/vaada/email/outbox.py, /home/user/vaada/api/vaada/models/ops.py, routes/DevOutbox.tsx

## [should-fix] deeds | 390 light and dark | layout
WHERE: Every DeedLine title row (0003, 0002, 0004, 0001)
PROBLEM: The dotted leader (min-w-6) and the amount are flex siblings of the title, so they hold a column of about 110px on every line, not just the last. Titles take about 60% of the available width and break into 3–4 short lines ('Kiln Labs ki brand / identity: logo, colour / palette, type aur ek / page ki guidelines'), with empty space to their right. It reads as ragged, not as an index.
FIX: Below sm, let the title use the full width: wrap the flex row (`flex-wrap`), or move the amount to the right end of the standing line (`For Rahul Mehta · Sent … ₹12,500`). Keep the leader layout from sm up. Alternatively use the table-of-contents technique: set the title inline and append the leader and amount as an inline-flex span pushed right, so only the last line reserves room for the figure.
FILES: routes/Deeds.tsx

## [should-fix] deeds | all | layout
WHERE: Shell: the strip between the end of <main> and the footer rule (/deeds y≈913, /ledger y≈1815, /admin y≈1233, /outbox y≈1768 at 1440)
PROBLEM: The paper grain sits on <main className="grain">, but the footer's mt-16 margin is outside main. That leaves a 64px band of un-grained paper-deep above the footer rule, with a visible edge where the grain stops. In dark the background steps from #13110C to #0F0D09 in a straight line across the page, and in light from #E5DCC8 to #E9E0CC. It shows on every page.
FIX: Move the spacing inside the grained area: put pb-16 on <main> and remove mt-16 from <footer> in Colophon. Or put the .grain class on the Shell's outer flex wrapper, so masthead, main and footer share one continuous sheet of grain.
FILES: app/Shell.tsx

## [polish] deeds | all | wording
WHERE: Page header and the row standings
PROBLEM: The lede says 'by number, newest first', but the index is grouped by standing (0003, 0002 | 0005, 0004 | 0001). Deed 0002's standing line repeats its section heading ('Under way' under 'Under way') and so tells the Maker nothing: both parts are delivered and a release is pending. The small-caps kicker 'INDEX' only repeats the title 'Index of deeds', as 'DESK' does above 'The desk' on /admin. Both read like a template eyebrow, unlike 'BAHI-KHATA' on /ledger, which adds meaning.
FIX: Reword the lede to 'Every deed you are party to, grouped by where it stands, newest first.' For active deeds, say what comes next, using data the API already has (for example 'Both parts delivered; Razorpay releases the rest on Thu 15 Oct', or '₹12,500 held'). Drop the kicker where it repeats the title, or make it carry information (for example 'Aditi Rao · 5 deeds').
FILES: routes/Deeds.tsx, routes/Admin.tsx

## [polish] deeds | 390 (orphan); all (apostrophe); dark (radios) | layout
WHERE: Site colophon / footer (every page)
PROBLEM: At 390 the colophon wraps as '…Dictated with Wispr / Flow.', leaving an orphaned word. The disclaimer uses a typewriter apostrophe ('isn't a lawyer'), while the rest of the app sets curly ones ('didn’t', 'Razorpay’s'). In dark, the unchecked 'Light' and 'Dark' theme radios render as solid system-grey discs (#3B3B3B-ish), a colour that isn't in the palette.
FIX: Write 'Wispr&nbsp;Flow' (or add text-balance) and change the apostrophe to ’ in 'isn’t'. Style the radios with appearance-none: a 1px ink-soft ring, filled with ink when checked.
FILES: app/Shell.tsx

CLEAN: []