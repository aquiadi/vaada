# Plan

Vaada is built as four parts in one repo: a registry contract, an API with
background workers, a web app, and the local infrastructure that ties them
together for `make dev`.

## Repo layout

```
Makefile                 make dev, make test, make e2e, make screens
docker-compose.yml       redis + anvil (+ a foundry tool container for deploys)
Procfile.dev             api, worker, web, run by honcho
supabase/                config.toml and email templates for `supabase start`
scripts/                 dev bootstrap: env files, contract deploy, waiting on ports
contracts/               Foundry project
  src/VaadaRegistry.sol
  test/VaadaRegistry.t.sol
  script/Deploy.s.sol    one script, chain picked by RPC/env (anvil, amoy, polygon)
api/                     FastAPI, Python 3.12, uv
  vaada/
    config.py            settings, boot guards
    db.py, clock.py
    models/              SQLAlchemy models, one file per area
    auth.py              Supabase JWKS verification, persona tokens
    terms.py             Pydantic terms and validation rules
    agreement.py         canonical JSON, keccak, nonce
    money/               the money module
      gateway.py         PaymentsGateway protocol and value types
      fake_gateway.py    FakeGateway (memory store for tests, Postgres store for dev/demo)
      razorpay_gateway.py
      fees.py            fee and transfer arithmetic, fit assertion
      ledger.py          append-only ledger writes
      locks.py           per-deal advisory lock
      funding.py, delivery.py, refunds.py, cancellation.py, disputes.py
      webhooks.py        event processing
      reconciliation.py
    registry/            recorder (web3), ref HMAC, queue
    email/               templates and transports (outbox, Resend)
    routes/              HTTP routers
    jobs/                arq worker settings and job functions
    seed.py
  alembic/
  tests/
web/                     React + TS + Vite + Tailwind v4
  src/
    normalize/           pure normalizers + table tests
    voice/               voice update interpreter + table tests
    agreement/           canonical JSON + keccak (shared vectors with the API)
    deed/                deed template, summary template
    design/              guilloche, seal, paper, tokens
    routes/              one folder per screen
    api/                 typed client, TanStack Query hooks
  e2e/                   Playwright: full flow, screenshots
docs/screens/            final screenshots
```

## Build order

1. Registry contract and Foundry tests.
2. Normalizers and their test tables.
3. API skeleton: settings and boot guards, models, the Alembic migration
   (including the append-only triggers), auth, users.
4. Money module with FakeGateway and its tests: fees, deal length, funding,
   delivery, approval, refund, cancellation, dispute, reconciliation.
5. Webhook endpoint, webhook processing job, worker crons, registry recorder.
6. Web scaffold, design tokens and type scale on `/styleguide`.
7. Screens in the spec's order.
8. Voice updates, emails, legal pages, seed.
9. `make dev` end to end, Playwright e2e of the full dev flow.
10. Screenshot passes at 1440 and 390 in both themes, fixes, final shots.
11. Demo config, RazorpayGateway against test mode with the opt-in suite,
    staging config, README, GO_LIVE.

Commit after each phase. Tests green before moving on.

## How the pieces talk

- The browser normalizes dictation as it lands; the API re-validates every
  write with Pydantic.
- The API never imports the Razorpay SDK outside `razorpay_gateway.py`.
- FakeGateway keeps its state in Postgres (schema `fakegw`) in dev and demo so
  the API and the worker see the same fake Razorpay. It delivers its webhooks
  over HTTP to our own endpoint, signed, so the real verification path runs.
- Time travel for dev and demo is a clock offset read by both the app and
  FakeGateway, so "five days pass and the hold expires" is the same code path
  as production.
- Every money mutation runs under a per-deal Postgres advisory lock, records
  only confirmed results, and writes ledger rows keyed by a unique idempotency
  key, so a replay or a double click is a no-op.
- Registry writes are rows in a queue table posted by a worker; nothing in the
  money path waits on the chain.

## If I run long, cut in this order

1. The reputation page `/m/:handle`.
2. Dark mode.
3. Google sign-in (email OTP stays).
4. Voice updates.
5. The demo environment (only if Route already works in test mode).

Never cut: the money module and its tests, webhook handling, the ledger, the
normalizers, the Tab-and-Flow-key flow, the deed page, the legal pages,
FakeGateway.
