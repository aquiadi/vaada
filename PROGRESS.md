# Progress

## Needs AJ

- Razorpay Route is not yet active on your account (assumed). Everything runs on FakeGateway until it is; see GO_LIVE.md.
- `make dev` uses Docker images (Supabase, Redis, Anvil) that this build container could not pull (its egress proxy blocks registry blobs). Every step after `make infra` was run here against native Postgres 16, Redis and Anvil on the same ports; `make infra` itself has not been run on a machine with Docker yet. Run `make dev` once and tell me (or the next session) if Supabase start fails.

## Done

- Registry contract with Foundry tests (access control, rotation, no storage, gas) and a deploy script for Anvil, Amoy and Polygon.
- Normalizers (amount, date, plan, count, names, email) with 250 table tests, including a one-line-per-case file for corrected dictations.
- API: settings with boot guards, models, one Alembic migration with append-only triggers on the ledger and acceptances, agreement canonicalisation and keccak hashing with vectors shared with the browser.
- Money module behind PaymentsGateway, with FakeGateway (in-memory for tests, Postgres in dev and demo) and RazorpayGateway: fees and the fit assertion, funding, webhooks (verify, store, process in a job, any order, replayable), delivery with Razorpay-enforced hold expiry, approval, two-step refunds with retry, mutual cancellation with kill fee, disputes with last-second protection, reconciliation. 106 API tests.
- HTTP API, admin queue, dev tools (personas, outbox, time travel, fake Checkout, tick), arq worker with crons, registry recorder (verified against Anvil), email outbox and Resend sender, seed (4 personas, 4 deeds).
- Makefile, docker-compose, Supabase config with OTP template and asymmetric signing keys, env writer, Procfile.
- Web foundation: tokens for both themes, deed sheet with generated guilloche, seal, pen strikes, shell, API client and persona sessions, the deed text shared by editor and published deed, and /styleguide.
- Deed editor at /new: blanks filled by keyboard or Wispr bursts with live normalising and marginalia, payment plan writing the parts, manual parts when the plan can't be read, strikable clauses, autosave, send with problems mapped back to the margin, WhatsApp share. Checked at 1440 and 390 in both themes.

## Next

- Web: deal room, client deed and checkout, books (ledger, deeds, maker page, admin), front pages (home, login, payouts), legal pages, voice update interpreter.
- Playwright e2e and screenshot passes.
- Demo and staging deploy config, opt-in Razorpay test-mode suite, README, GO_LIVE.

## Broken

- Nothing known.
