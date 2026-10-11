# Vaada (वादा)

Vaada lets an Indian freelancer write down a deal with a client as a deed, get it accepted, and get paid milestone by milestone. The freelancer fills the deed's blanks by speaking into them with Wispr Flow, or by typing. Wispr Flow is the only AI in Vaada: everything after the words land in a blank is ordinary deterministic code. The client pays by UPI, netbanking or card through Razorpay Checkout. Razorpay Route holds the money in transfers to the freelancer's linked account and releases each part when the client approves it, or five days after delivery. Vaada never holds the money itself. Each step is also recorded on a small public registry contract on Polygon, as hashes and random ids only, so a freelancer can show a track record without showing anyone's name.

## Running it

```
make dev
```

From a fresh clone, with no external keys. It needs Docker, Node 20+ with pnpm, Python 3.12 with uv, and Foundry (`make check` says what's missing and how to get it). It:

1. installs dependencies (`uv sync`, `pnpm install`),
2. starts Redis and Anvil in Docker and Supabase with `supabase start` (Postgres, Auth, and Mailpit for email),
3. deploys the registry contract to Anvil,
4. writes `.dev/api.env` and `web/.env.development.local` from what it started,
5. runs migrations and seeds four personas and four deeds,
6. runs the API (:8000), the worker and the web app (:5173).

Open http://localhost:5173. In dev you can sign in with an emailed code (read it in Mailpit at http://localhost:54324) or switch between personas in the bottom-left corner: Aditi (a designer), Rahul and Meenal (clients) and the Desk (admin). Payments go through FakeGateway, which behaves like Razorpay, including signed webhooks and held transfers, but moves no money. The persona slip can also move the clock forward a day or six, so review windows can lapse without waiting.

Other targets:

```
make test            contracts, API and web tests, typecheck and lint
make lint            ruff, mypy, eslint, forge fmt
make e2e             Playwright: the whole flow in a browser (needs make dev running)
make screens         screenshots of every route at 1440 and 390 in both themes, into docs/screens
make test-razorpay   RazorpayGateway against real Razorpay test mode (opt-in; see GO_LIVE.md)
make stop            stop the containers; make reset also wipes the local database
```

## Layout

```
contracts/   VaadaRegistry (Foundry): an event log of deal hashes, no storage
api/         FastAPI app, arq worker, Alembic migrations; money/ is the only code that moves money
web/         React app; normalize/ turns dictated words into amounts, dates and plans
shared/      agreement test vectors both the API and the browser hash against
supabase/    local Supabase config and the sign-in email
deploy/      environment templates for demo, staging and production
```

PLAN.md has the build plan, DECISIONS.md every judgement call, PROGRESS.md where things stand.

## Environments

`VAADA_ENV` picks one of four. The API checks its configuration at boot and refuses to start if something would put real money or real people at risk.

| | dev | demo | staging | production |
|---|---|---|---|---|
| Payments | FakeGateway | FakeGateway | Razorpay test mode (`rzp_test_`) | Razorpay live (`rzp_live_`) |
| Razorpay keys | optional | refused | required | required |
| Sign-in | personas and email code | personas and email code | email code (and Google if enabled) | same |
| Dev tools (outbox, clock, fake checkout) | on | on, shared by every visitor | refused | refused |
| Registry | Anvil | optional (Amoy) | Polygon Amoy | Polygon PoS |
| Email | outbox | outbox only | Resend or outbox | Resend |

## Environment variables

The API reads these from its environment, or from the file named by `VAADA_ENV_FILE`. `deploy/*.env.example` has a filled-in template for demo, staging and production.

| Variable | Default | What it is |
|---|---|---|
| `VAADA_ENV` | required | `dev`, `demo`, `staging` or `production` |
| `DATABASE_URL` | required | Postgres. On Supabase use the session pooler (port 5432); the transaction pooler (6543) is refused because money operations hold a lock across commits |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | the worker's queue |
| `WEB_ORIGIN` | `http://localhost:5173` | the web app's origin for CORS; comma-separated to allow several, and the first is used for links in email |
| `API_PUBLIC_URL` | `http://localhost:8000` | where the API is reachable; FakeGateway delivers its webhooks here |
| `TRUST_PROXY_HEADERS` | `false` | set `true` behind Railway's proxy, so rate limits and the record of who accepted a deed see the client's real address |
| `SUPABASE_URL` | required | the Supabase project URL; the API fetches its JWKS from `/auth/v1/.well-known/jwks.json` |
| `SUPABASE_ANON_KEY` | empty | handed to the browser through `/config` |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | the project's secret key; used only to delete a person's sign-in record when they delete their account |
| `GOOGLE_SIGNIN_ENABLED` | `false` | shows "Continue with Google" (configure the provider in Supabase first) |
| `PERSONA_SWITCHER_ENABLED` | `false` | dev and demo only |
| `PERSONA_TOKEN_SECRET` | empty | signs persona tokens; 32+ characters when personas are on |
| `DEV_TOOLS_ENABLED` | `false` | outbox, clock and fake checkout routes; dev and demo only |
| `PAYMENTS_GATEWAY` | `razorpay` | `fake` (dev and demo only) or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | empty | API keys; the prefix must match the environment |
| `RAZORPAY_WEBHOOK_SECRET` | empty | the secret set on the Razorpay webhook |
| `FAKE_GATEWAY_KEY_ID`, `FAKE_GATEWAY_KEY_SECRET`, `FAKE_GATEWAY_WEBHOOK_SECRET` | dev values | FakeGateway's stand-ins for the three above |
| `FAKE_GATEWAY_ACTIVATION_SECONDS` | `5` | how long FakeGateway takes to "activate" a payout account |
| `FAKE_GATEWAY_CHAOS` | empty | `duplicate`, `shuffle` or both: FakeGateway's webhooks arrive twice and out of order |
| `ROUTE_ACCOUNT_CATEGORY`, `ROUTE_ACCOUNT_SUBCATEGORY` | `services`, `consulting` | the business category freelancers' linked accounts are filed under; use the pair Razorpay confirms |
| `NEW_DEALS_PAUSED` | `false` | stops new deeds going out and new payments coming in; money already held carries on |
| `CLIENT_FEE_BPS` | `242` | processing fee the client pays on top of the deal, in basis points |
| `GATEWAY_FEE_BPS` | `236` | the most Razorpay may take of an order (2% + 18% GST); used to prove transfers fit |
| `ROUTE_TRANSFER_FEE_BPS` | `0` | any per-transfer Route fee, once Razorpay confirms it |
| `PLATFORM_FEE_BPS` | `0` | Vaada's own fee, taken from each milestone before transfer |
| `TDS_BPS` | `0` | tax withheld from each milestone, if the CA's review says so |
| `UPI_LIMIT_PAISE` | `10000000` | UPI is not offered above this order amount (₹1,00,000) |
| `MIN_DEAL_PAISE` | `50000` | smallest deed (₹500) |
| `MAX_DEAL_DAYS` | `120` | longest a deal may run from when it's sent |
| `ACCEPT_PAY_DAYS` | `7` | an accepted deed must be paid within this many days |
| `REVIEW_WINDOW_DAYS` | `5` | days the client has to approve or dispute a delivered part |
| `HOLD_BUFFER_HOURS` | `24` | extra hold after the review window, so a last-minute dispute still lands |
| `GRACE_DAYS` | `3` | days after a due date before the client may ask for that part back |
| `REFUND_LIMIT_DAYS` | `175` | refunds must start within this many days of payment (banks stop at 180) |
| `REFUND_WARNING_DAYS` | `14` | admin is warned this long before a disputed refund would hit the limit |
| `CHAIN_RPC_URL`, `CHAIN_ID` | empty, `31337` | the chain the registry lives on |
| `REGISTRY_ADDRESS` | empty | from `contracts/deployments/<chain id>.json` |
| `RECORDER_PRIVATE_KEY` | empty | the hot key allowed to record; needs a little gas money |
| `CHAIN_EXPLORER_TX_URL` | empty | prefix for transaction links, e.g. `https://polygonscan.com/tx/` |
| `REF_HMAC_SECRET` | required | keys the opaque references written on chain; 32+ characters, never rotate it |
| `EMAIL_TRANSPORT` | `outbox` | `outbox` keeps email in the database (dev tools show it); `resend` sends it |
| `RESEND_API_KEY` | empty | |
| `EMAIL_FROM` | `Vaada <deeds@vaada.local>` | |
| `ADMIN_EMAILS` | empty | comma-separated; these accounts get the admin queue and dispute copies |
| `CONTACT_ADDRESS`, `CONTACT_PHONE`, `SUPPORT_EMAIL` | empty | shown on the contact page; it says plainly that they're missing until set |
| `LEGAL_ENTITY`, `GRIEVANCE_OFFICER`, `JURISDICTION_CITY` | empty | the operating company, the grievance officer named on the contact page, and the city whose courts the terms name |
| `SENTRY_DSN` | empty | error reports, without personal data |
| `RATE_LIMIT_ENABLED` | `true` | |
| `LOG_LEVEL` | `INFO` | |

The web app needs only `VITE_API_URL` (and optionally `VITE_SENTRY_DSN`); everything else, including the Supabase URL and key, comes from the API's `/config` at runtime.

Tests read `TEST_DATABASE_ADMIN_URL` (default: the local Supabase Postgres) and create a throwaway database. The opt-in Razorpay suite reads `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_TEST_LINKED_ACCOUNT_ID`, `RAZORPAY_TEST_PAYMENT_ID` and `RAZORPAY_TEST_ONBOARDING` (see the top of `api/tests/test_razorpay_test_mode.py`). Deploying the registry reads `REGISTRY_OWNER` and `REGISTRY_RECORDER`.

## Deploying demo and staging

Both are three pieces: a Supabase project, two Railway services (API and worker) with a Railway Redis, and the web app on Vercel. Use a separate Supabase project for each environment.

**Supabase**

1. Create the project. Under Authentication, turn on email sign-in. Set both the "Magic link" and "Confirm signup" templates to the contents of `supabase/templates/otp.html`, with the subject "Your Vaada sign-in code".
2. Under URL configuration, set the site URL to the web app's address and add `<web>/login` as a redirect URL.
3. Under JWT signing keys, switch the project to asymmetric keys (ES256) and rotate so new tokens use them. The API only accepts tokens it can verify against the project's public JWKS; it does not accept the legacy shared secret.
4. For staging, set custom SMTP (Resend works) so sign-in codes aren't throttled by Supabase's built-in mailer.
5. Copy the session pooler connection string (port 5432) for `DATABASE_URL`.

**Registry** (staging always; demo optionally)

```
cd contracts
REGISTRY_OWNER=<cold address> REGISTRY_RECORDER=<recorder address> \
  forge script script/Deploy.s.sol --rpc-url amoy --broadcast --private-key <deployer key>
```

with `AMOY_RPC_URL` set. The address lands in `contracts/deployments/80002.json`. Send the recorder address a little Amoy POL from a faucet.

**Railway**

1. Add a Redis database to the project.
2. Add a service from this repo with root directory `api`. Point its config-as-code path at `api/railway.demo.toml` for demo (it migrates and seeds before each deploy) or `api/railway.toml` for staging (it migrates). Give it the variables from `deploy/demo.env.example` or `deploy/staging.env.example`, and a public domain.
3. Add a second service from the same repo and root, with config path `api/railway.worker.toml` and the same variables. It runs the queue: webhook processing, hold checks, reconciliation, email and registry writes.

**Vercel**

Import the repo with root directory `web`. Set `VITE_API_URL` to the API's public URL. `web/vercel.json` handles the single-page routing and headers. Then set the API's `WEB_ORIGIN` to the Vercel address.

**Razorpay** (staging only)

In the Razorpay dashboard, in test mode, add a webhook to `<api>/webhooks/razorpay` with the secret you put in `RAZORPAY_WEBHOOK_SECRET`, and these events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `transfer.processed`, `transfer.failed`, `refund.created`, `refund.processed`, `refund.failed`, and the `account.*` and `product.route.*` events. Route has to be enabled on the account first; GO_LIVE.md covers that.

To check a deploy, open `<api>/health` and `<api>/config`. A misconfigured API refuses to start and says why in its logs.

Production is the staging setup with the production template, live keys, Polygon PoS, and the steps in GO_LIVE.md. It needs no code changes.
