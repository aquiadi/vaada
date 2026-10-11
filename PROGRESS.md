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

- A six-lens review (hard rules, design, accessibility, web/API contract, code style, logic) found 84 confirmed problems.
  The API, config and shared-helper ones are fixed and committed (stuck releases after refunds, Sentry frame variables,
  data export and account deletion, voice-update privacy, stale tokens on public pages, amounts after fees, plain errors,
  input limits, rate limits, dead code). The web ones are being fixed now by five agents on disjoint files; when they
  report: typecheck, lint, tests, the e2e, then commit.
- Then the screenshot passes: reset the dev database (it collects test deals), `make screens`, look at every shot, fix,
  repeat; final shots in docs/screens.

## Broken

- Nothing known beyond the review findings above. The e2e test (`make e2e`) passed before the web fixes began.
