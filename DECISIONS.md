# Decisions

One line each. Newest at the bottom.

- Fees: Razorpay charges its fee on the whole order amount, including our processing fee, so a 2.36% client fee on the deal total cannot cover a 2.36% fee on the grossed-up order; `CLIENT_FEE_BPS` keeps its meaning (bps of the deal total) but defaults to 242, and a new `GATEWAY_FEE_BPS` (default 236, worst case for allowed methods, GST included) drives the fit assertion, which the API also checks at boot.
- Fees: added `ROUTE_TRANSFER_FEE_BPS` (default 0) for any per-transfer Route fee, counted in the fit assertion; set it once Razorpay confirms the number.
- Idempotency: Razorpay documents `X-Refund-Idempotency` for refunds only; reversals have no idempotency header, so before reversing we list the transfer's reversals and reuse one whose notes carry our key, and every money operation also runs under a per-deal lock.
- Holds: per the docs, `PATCH /transfers/:id` with `on_hold: true` and no `on_hold_until` holds indefinitely; that is how a dispute puts a hold back.
- Auto-release: Razorpay sends no webhook when `on_hold_until` passes, so a worker confirms expired holds by fetching the transfer and writes `released` only from that confirmed response.
- Linked accounts: Route onboarding uses the four documented calls (account, stakeholder, product config, product config update with settlement details) rather than the newer composite call, so each step's status can be shown and retried.
- Webhooks: stored payloads are redacted (payer email, contact, VPA, card object) after the signature is verified; processing never needs those fields, and replay works from the stored copy.
- Ledger: amounts are always positive and the entry kind carries direction; added `fee_returned`, `tds_returned` and `refund_failed` kinds so refunds of milestones with retained fees and failed refunds can be recorded without updating rows.
- Ledger idempotency: every ledger row carries a unique key built from the Razorpay object id and the kind, so replays insert nothing.
- Our tables live in a Postgres schema `vaada`, not `public`, so Supabase's auto-generated REST API never exposes them; the migration revokes access from the `anon` and `authenticated` roles when they exist.
- FakeGateway stores its state in Postgres schema `fakegw` in dev and demo, because the API and the worker are separate processes; tests use an in-memory store behind the same class.
- Dev and demo get a clock offset ("time travel") shared by the app and FakeGateway, so the e2e test can let a review window lapse; boot guards forbid it elsewhere, and in demo it is global for every visitor.
- Client email is kept outside the frozen agreement so a typo can be corrected after publishing; any signed-in person other than the maker can accept, and the acceptance records their own email.
- Added an index of the signed-in user's deeds at `/deeds`; the spec lists no screen for finding your own deals, and the deal room needs a way in.
- Web reads environment, Supabase URL and key, gateway kind and dev flags from the API's `/config` at runtime, so the web build needs only `VITE_API_URL`.
- Due dates are stored as the last second of that day in Asia/Kolkata, expressed in UTC (Fri 17 Oct 2026 becomes 2026-10-17T18:29:59Z).
- Deed blanks at rest are set in the deed's own type (a focusable text box); focusing one swaps in a real input, so a filled deed reads as one document and Wispr Flow still has a real field to paste into.
- Marginalia controls (strike toggles, "heard" corrections) stay out of the Tab order so Tab walks only blanks and a dictation never lands on a button; the strike toggles are repeated at the foot of the deed in the Tab order, so the keyboard path is complete.
- Autosave runs saves one after another, each carrying the version the last returned; Send saves anything outstanding first, because publishing freezes what the server holds.
- A struck clause gets one pen stroke per line of its words, measured from the rendered text, so the stroke ends where the words end.
