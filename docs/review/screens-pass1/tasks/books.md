# Group: books (/deeds, /ledger, /admin, /dev/outbox)

You own: web/src/routes/Deeds.tsx, web/src/routes/Ledger.tsx, web/src/routes/Admin.tsx, web/src/routes/DevOutbox.tsx,
web/src/books/** (DeskTable, DisputeDecision, desk.ts, paise.ts and tests).
The API group is changing api/vaada/ledger_view.py (CSV header "Released to you (INR)", entry order) and
api/vaada/email/outbox.py (letters stamped with the dev clock) at the same time.

1. Ledger print (must-fix): the tfoot "Balance as of today" repeats under every printed page and contradicts the rows
   above it. The shell group makes tfoot print as a row group globally; in your file make sure the closing rows
   print once at the end (if you'd rather not depend on that, move them into a final tbody). Rows must not split.
2. Ledger provenance: on screen and paper, "Balance as of today" / "Whole ledger, as of today" → "Balance on
   11 Oct 2026" (today's IST date from the API clock, as the page already knows it). Add a print-only line under
   the header naming whose ledger it is and when it was printed ("Ledger of Aditi Rao · printed 13 Oct 2026, 18:40
   IST"), from useMe(). The shell group adds a print-only running head with the wordmark on every page.
3. Jama column labelled "received" while the page calls the same money "released": label it "released to you"
   (the API group renames the CSV header to match).
4. Ledger at 390: Particulars is squeezed to ~145px and each entry wraps 5–7 lines with lines starting on a bare
   "·"; header labels misalign ("Amanat" sits ~22px above "Jama"). Below sm, either print the amounts under the
   particulars (right-aligned, labelled) and keep the column table from sm up, or narrow the amount columns and
   shorten the meta line, with nowrap on "Deed No. 0001" and names. One-line header labels or equal two-line
   heights so Amanat and Jama share a baseline.
5. Ledger wording: IST is stated three times; keep the caption's sentence, drop "Times are in IST." from the CSV
   note and the per-row " IST" on wide screens. Rename the "Open deeds" filter to "Under way" to match /deeds.
6. Admin (DeskTable, Admin.tsx): DeskTable forces `min-w-[52rem]` even for the 4-column refund-windows table, so at
   390 the deadline column (the reason the section exists) is off-screen and the Paid date is cut mid-glyph. Size
   each table to its content (a minWidth prop: none for narrow tables, 52rem only where 8 columns need it), or
   stack rows below sm with the deadline first; for tables that must scroll, a visible cue. At 1440 narrow tables
   shouldn't stretch across 1104px. Add "As of <IST time>" (the queue's fetch time) to the "Signed in as…" line.
   When all is quiet, let empty sections be compact (a two-column register "§ title | none open") so the all-clear
   fits in one view, if it reads well.
7. Outbox (DevOutbox.tsx): the lede says "None of them left this machine." then every row says "sent". Map statuses
   to words (sent → "kept here", queued → "waiting", failed → "failed") and reword the lede: "Every letter Vaada
   would have sent, newest first. In development and the demo, letters are kept here instead of being emailed."
   Wrap each row's time in `whitespace-nowrap`.
8. Deeds index (Deeds.tsx): at 390 the dotted leader and amount hold a ~110px column on every title line, so titles
   break into 3–4 short lines. Below sm let the title take the full width (move the amount to the end of the
   standing line, or wrap); keep the leader layout from sm up. Lede: "Every deed you are party to, grouped by where
   it stands, newest first." For under-way deeds, the standing line should say what comes next using data the API
   already returns (e.g. "Both parts delivered; Razorpay releases the rest on Thu 15 Oct", or what is held), not
   repeat the section heading. Drop the kickers that only repeat the title ("INDEX" over "Index of deeds", "DESK"
   over "The desk"), or make them carry information.
