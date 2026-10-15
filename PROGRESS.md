# Progress

## Needs AJ

- Everything in GO_LIVE.md. Start with item 1 (Route, with Razorpay's written approval of held transfers for a services marketplace): the whole money model depends on it.
- Razorpay Route is not yet active on your account (assumed). Everything runs on FakeGateway until it is.
- `make dev` uses Docker images (Supabase, Redis, Anvil) that this build container could not pull (its egress proxy blocks registry blobs). Every step after `make infra` was run here against native Postgres 16, Redis and Anvil on the same ports; `make infra` itself has not been run on a machine with Docker yet. Run `make dev` once and tell me (or the next session) if Supabase start fails.

## Done

- Registry contract with Foundry tests (access control, rotation, no storage, gas) and a deploy script for Anvil, Amoy and Polygon.
- Normalizers (amount, date, plan, count, names, email) with 250 table tests, including a one-line-per-case file for corrected dictations.
- API: settings with boot guards, models, one Alembic migration with append-only triggers on the ledger and acceptances, agreement canonicalisation and keccak hashing with vectors shared with the browser.
- Money module behind PaymentsGateway, with FakeGateway (in-memory for tests, Postgres in dev and demo) and RazorpayGateway: fees and the fit assertion, funding, webhooks (verify, store, process in a job, any order, replayable), delivery with Razorpay-enforced hold expiry, approval, two-step refunds with retry, mutual cancellation with kill fee, disputes with last-second protection, reconciliation. 120 API tests.
- HTTP API, admin queue, dev tools (personas, outbox, time travel, fake Checkout, tick), arq worker with crons, registry recorder (verified against Anvil), email outbox and Resend sender, seed (4 personas, 4 deeds).
- Makefile, docker-compose, Supabase config with OTP template and asymmetric signing keys, env writer, Procfile. Sign-in by emailed code verified end to end against GoTrue with ES256 keys.
- Web foundation: tokens for both themes, deed sheet with generated guilloche, seal, pen strikes, shell, API client and persona sessions, the deed text shared by editor and published deed, and /styleguide.
- Deal room (/d/:id) and client deed with checkout (/a/:slug), including FakeCheckout in dev and Razorpay Checkout otherwise.
- Deploy config: one API image, Railway configs for API, worker and the demo (which seeds), Vercel config, env templates for demo, staging and production. Image steps and demo boot verified natively.
- RazorpayGateway request tests (offline) and an opt-in suite against Razorpay test mode (`make test-razorpay`). Strict mypy is clean and part of `make lint`.
- README.md and GO_LIVE.md.
- Voice updates: rule-based interpreter (56 table tests) and the "What happened today?" blank; applying is locked, checked up front and safe to retry.
- Books: ledger (bahi-khata, CSV in IST), deeds index, maker certificate (/m/:handle), admin queue with dispute decisions.
- Playwright: `e2e/flow.spec.ts` (the whole dev flow) and `e2e/screens.spec.ts` (every route, two widths, two themes).
- Deed editor at /new: blanks filled by keyboard or Wispr bursts with live normalising and marginalia, payment plan writing the parts, manual parts when the plan can't be read, strikable clauses, autosave, send with problems mapped back to the margin, WhatsApp share. Checked at 1440 and 390 in both themes.

## Next

- Screenshots: two passes done; the final 84 shots (21 routes, 1440 and 390, light and dark) are in docs/screens,
  saved as 256-colour PNGs to keep the repo small. Pass 1 (15 routes reviewed in depth) found 80 problems, in
  docs/review/screens-pass1. Fixed: print (buttons hidden, headings kept with their text, the ledger balance printed
  once, full registry hashes on paper, editing controls off a printed draft), the read deed (centred to its measure,
  hanging sub-clauses, "in two parts, as follows:", typographic apostrophes, evidence spaced), the seal pressed on
  the client's deed, the payouts status badge, margin errors in ink, failed blanks' doubled full stops, the footer
  seam and theme radios, the persona slip on phones, and the wording of the receipt, refund note, register, dispute
  effect, outbox and ledger CSV.
- Since then also fixed: the home page shows the whole sample deed small (foot, Stamp Act line and seal visible), the
  editor margin merges plain "To fill in" notes so paragraphs don't leave holes, filled blanks have a quieter
  underline, the seal's legend closes the ring and an unstamped seal no longer says "Funded", every printed page
  carries a small running head (Vaada, the address, the print date), the admin desk says "as of" when, the maker
  certificate's "since" is never later than its first deed, and the deeds index and maker rows read cleanly at 390.
- Still open, polish only: a phrase normaliser for mid-sentence blanks (the seed's values are written that way
  already), role-specific "released" wording for the client, outbox dates on the dev clock, and a dedicated review of
  the six legal pages.
- Deploy: everything except Supabase runs on Railway (API, worker, web, Redis); README "Deploying" has the steps.
- In a container that can't pull Docker images, `scripts/native-dev/setup.sh` builds the same stack natively once,
  and `scripts/native-dev/up.sh` starts it again after a restart (web on 5173).

## Broken

- Nothing known beyond the screenshot findings above. The e2e (`make e2e`) passed after the review fixes.
