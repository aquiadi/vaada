# Group: room (deal room /d, client deed /a, maker certificate /m)

You own: web/src/room/** (MilestoneLedger, Register, MoneyAccount, VoiceUpdates, words.ts, FeeBreakdown,
PayStep, Clickwrap, FakeCheckout, Proposals, RoomAction and tests), web/src/routes/DealRoom.tsx,
web/src/routes/ClientDeed.tsx, web/src/routes/Maker.tsx, web/src/format/dates.ts (+ dates.test.ts),
web/e2e/flow.spec.ts (only to update strings you change; don't run it).
The deed group is changing PublishedDeed/DeedText (read-only sheet now `mx-auto max-w-[52rem]`, evidence block,
RegistryLink with a print-only full hash) and Seal.tsx at the same time.

1. Client sees Maker wording: "Released for the next settlement" (ledger standing and the money table) is bank-side
   jargon and stale for the client. Word it by role: client "Released to Aditi" (use firstName); maker keeps
   "Released for the next settlement" (the e2e checks it as the maker; if the e2e checks it on the client's screen,
   update flow.spec.ts to the client wording).
2. The voice-update placeholder is the Maker's sentence for both roles. Give the client a client's example (e.g.
   "Pehla part dekh liya, theek hai; logo mein ek revision chahiye…").
3. Ledger "Releases about 16 Oct 2026, 21:46 IST": "about" beside a minute contradicts itself. Drop "about" (the
   register states the same moment flatly), e.g. "16 Oct 2026, 21:46 IST, unless a problem is raised first".
4. "Revisions: 0 of 3 used." can strand alone on a printed page: move it into the ledger's last row or a ledger
   foot, and give milestone entries, register rows and money rows `break-inside: avoid` (the shell group adds
   global li/tr rules; add `keep-together` or `print:break-inside-avoid` where your blocks aren't li/tr).
5. Dates: non-breaking spaces inside "15 Oct 2026" and before "IST" in formatInstantIst/formatIsoDate (format/
   dates.ts), keeping the ", " that Register splits on; `text-wrap: pretty` on the register note and summaries so
   "order." and "IST." aren't orphaned. (The API group does the same in api/vaada/format.py for the register's
   server-written summaries.) Update dates.test.ts.
6. Client deed, paid (ClientDeed.tsx): the seal sits in a separate boxed card under the sheet, a success-badge
   pattern, and the printed deed carries no seal. When paid, pass the seal to PublishedDeed's `seal` prop
   (as DealRoom does), sized at least ~150px, animating the stamp when it is pressed here; shrink the receipt to a
   plain slip with one or two sentences and the deal-room link, no seal. Keep the heading focus on the stamp
   moment.
7. Receipt wording: "Razorpay holds ₹12,500 and releases it to Aditi one part at a time, as each is delivered and
   approved. The deal room shows where the rest went." contradicts the lede and §4, and "where the rest went"
   sounds like money went missing. Say what was paid and where it stands, e.g. "You paid ₹25,605 on 29 Sep 2026.
   ₹12,500 has been released to Aditi; Razorpay holds the other ₹12,500 until you approve that part or its
   review period ends." Singular when one part remains. Compute from the milestones.
8. Client deed print: the lede says "accept it and pay at the foot of the page" but the pay slip doesn't print.
   For accept/pay stages, `no-print` that lede and add a print-only line ("Deed No. 0003, sent by Aditi Rao. Read
   and accept it at <origin>/a/<slug>."). Hide screen-only controls in the receipt.
9. FeeBreakdown: "If a part isn’t delivered within three days of its date, you can ask for that part back." →
   "…within three days after its due date, you can ask for that part’s money back; the processing fee isn’t
   refunded." (drop the fee clause when the client fee is 0, as the deed does).
10. Slips under a read-only deed on /a (and /d where they sit directly under the deed): `mx-auto max-w-[52rem]`
    so their edges line up with the deed sheet; headers above may stay on the page container.
11. Maker certificate (Maker.tsx): (a) "the link beside each line opens that record": true only when some entry has
    tx_url; otherwise say "the transaction beside each line is that record" (the deed group makes RegistryLink
    show the full hash). (b) At 390 each row breaks into three lines ending in dangling "·": put "Deed No. 0002 ·
    Milestone I" and the amount on the first line, "Released Sat 3 Oct 2026" under it in ink-soft; separators
    outside nowrap spans; show each deed's hash once per deed, not per milestone. (c) Counts in words under 100
    ("three milestones under two deeds", numberWord) and drop "for settlement" ("has been released to them").
    (The wrong "Maker since" date is the API group's.)
12. Deal room print: check /d printed to A4 after your changes; headings and blocks shouldn't strand.
