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

- The six-lens review's 84 findings are fixed and committed; the e2e passed after them.
- Screenshot pass 1 is done for 15 of 21 routes. Five reviewers' findings are in
  docs/review/screens-pass1/pass1-*.md (80 findings), and they are split into seven fix groups by file ownership in
  docs/review/screens-pass1/tasks/ (common.md holds the rules every fixer follows; shell, deed, editor, room, books,
  api). Still to do, in order:
  1. Review the six legal routes (terms, privacy, refunds, delivery, contact, pricing) the same way and write a
     legal.md task file (owner of web/src/legal/** and web/src/routes/Legal.tsx).
  2. Run the fix groups in parallel on their disjoint files, then: tsc, eslint, vitest, the API checks, reset the
     dev database (`drop schema vaada cascade; drop schema fakegw cascade;`, `make migrate seed`), restart the API
     and worker, and run the e2e.
  3. Pass 2: `make screens` (or `SCREENS_DIR=... E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test --config
     playwright.screens.config.ts` in web), review every shot again, fix, and commit the final shots to docs/screens.
  4. Delete docs/review/screens-pass1 once its findings are dealt with; mark this done here.
- In a container that can't pull Docker images, `scripts/native-dev/setup.sh` builds the same stack natively once,
  and `scripts/native-dev/up.sh` starts it again after a restart (web on 5173).

## Broken

- Nothing known beyond the screenshot findings above. The e2e (`make e2e`) passed after the review fixes.
