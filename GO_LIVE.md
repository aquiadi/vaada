# Going live

Everything here needs you, not code. The order matters: the first two items decide whether the money model works at all, so do them before spending on the rest. Each item says what it unlocks. When they're all done, production is the staging setup with `deploy/production.env.example` filled in; no code changes.

## 1. Razorpay Route, approved for this exact use case

- [ ] Ask Razorpay to enable **Route** on the account, and get their **written approval** of this use case: a services marketplace where the client's payment is split into transfers to the freelancer's linked account, each transfer **held** (`on_hold`) until the client approves the work or a review window passes, then released. Say that Vaada never holds the funds itself and that the platform fee is currently zero.
- [ ] Ask which **business category and subcategory** freelancers' linked accounts should be created under. Set `ROUTE_ACCOUNT_CATEGORY` and `ROUTE_ACCOUNT_SUBCATEGORY` to their answer (the defaults are `services` / `consulting`).
- [ ] Enable Route in **test mode** too, and create one test linked account.

Unlocks: everything. Without held transfers there is no escrow, and the demo on FakeGateway is the only working environment. With Route in test mode, staging works end to end and `make test-razorpay` can run.

## 2. Razorpay account activation and KYC

- [ ] Complete activation and KYC for the platform's own account. Expect Razorpay to want a **registered business** (a private limited company or LLP is the usual route for a marketplace) and a **current account** in the business's name, plus the website with the legal pages live (terms, privacy, refunds, delivery, contact, pricing are all at `/legal/...` and `/pricing`).

Unlocks: live API keys (`rzp_live_...`).

## 3. Questions for Razorpay, in writing

The code makes a conservative assumption for each; their answers may let a setting change.

- [ ] **Longest a transfer may stay on hold.** Vaada holds a part from payment until approval or delivery plus 5 days plus 1, and a deal runs at most 120 days (`MAX_DEAL_DAYS`). If their limit is shorter, lower `MAX_DEAL_DAYS` to fit.
- [ ] **Refunds on held and reversed transfers.** Vaada reverses the held transfer first, then refunds the payment (with `X-Refund-Idempotency`). Confirm that a held transfer can be fully reversed, that a partial reversal then a partial refund works, and how long a refund on a reversed transfer takes.
- [ ] **Per-transfer Route fees.** If Route charges per transfer, set `ROUTE_TRANSFER_FEE_BPS`; the API checks at boot that transfers still fit inside what Razorpay leaves after its fees.
- [ ] **The gateway fee on the grossed-up order.** `GATEWAY_FEE_BPS=236` assumes at most 2% plus 18% GST on every method Vaada allows (UPI, netbanking, domestic Visa, Mastercard and RuPay cards). Confirm the rate card, including UPI above ₹2,000 and RuPay credit cards.
- [ ] **Convenience fee (customer fee bearer) with order transfers.** If Razorpay's model where the customer pays the gateway fee works with orders that carry transfers, it can replace Vaada's flat processing fee: set `CLIENT_FEE_BPS=0` and `GATEWAY_FEE_BPS=0`, then run one staging payment end to end and check in the webhook that the payment amount equals the order amount.
- [ ] **Settlement timing for linked accounts** (T+2 is assumed in the copy: "usually within two working days").

## 4. Live keys and the live webhook

- [ ] Generate live API keys. Set `RAZORPAY_KEY_ID` (must start `rzp_live_`) and `RAZORPAY_KEY_SECRET` on both Railway services.
- [ ] In live mode, add a webhook to `https://<api>/webhooks/razorpay` with a new secret (set it as `RAZORPAY_WEBHOOK_SECRET`) and the events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `transfer.processed`, `transfer.failed`, `refund.created`, `refund.processed`, `refund.failed`, `account.*`, `product.route.*`.
- [ ] Make one small real payment on a deed between two accounts you control, approve it, and watch the transfer settle. Then refund a second one.

Unlocks: real money. The API refuses to start in production with test keys, a missing webhook secret, FakeGateway, personas or dev tools.

## 5. A chartered accountant's review

- [ ] Whether Vaada, as an e-commerce operator, must **withhold TDS** on payments to freelancers: section 194-O under the Income-tax Act, 1961; check which section carries it under the Income-tax Act, 2025, and the rate.
- [ ] Whether **GST TCS** (section 52 of the CGST Act) applies when the freelancer is GST-registered.
- [ ] **GST registration** for the platform fee, if a platform fee is ever charged (`PLATFORM_FEE_BPS`, currently 0), and whether the processing fee the client pays is a supply by Vaada.

Unlocks: knowing the tax settings are right. If TDS applies, set `TDS_BPS`; the money is then held back from each part and kept by the platform for deposit. TDS also needs each freelancer's PAN on record, which Vaada deliberately doesn't keep today (Razorpay holds it), so that rule gets revisited, for PAN only, at that point.

## 6. Domain, email and contact details

- [ ] Buy the domain. Point the web app (Vercel) and `api.` (Railway) at it; set `WEB_ORIGIN` and `API_PUBLIC_URL`.
- [ ] Verify the domain in **Resend** (SPF and DKIM records), create a live API key, set `RESEND_API_KEY` and `EMAIL_FROM`. Set Supabase's custom SMTP to Resend too, so sign-in codes come from the same domain.
- [ ] A **real address and phone number** for the contact page: set `CONTACT_ADDRESS`, `CONTACT_PHONE` and `SUPPORT_EMAIL`. Razorpay checks the contact page during activation, so this comes before item 2's review.

Unlocks: email that arrives, and the contact page Razorpay looks for.

## 7. The registry on Polygon

- [ ] Choose two keys: an **owner** (cold; a hardware wallet or a Safe) that can rotate the recorder, and a **recorder** (hot; its private key goes in `RECORDER_PRIVATE_KEY`).
- [ ] Deploy: `cd contracts && REGISTRY_OWNER=<owner> REGISTRY_RECORDER=<recorder> forge script script/Deploy.s.sol --rpc-url polygon --broadcast --private-key <deployer key> --verify` with `POLYGON_RPC_URL` and `POLYGONSCAN_API_KEY` set. Set `REGISTRY_ADDRESS` from `contracts/deployments/137.json`, `CHAIN_ID=137`, `CHAIN_EXPLORER_TX_URL=https://polygonscan.com/tx/`.
- [ ] **Fund the recorder** with a little POL. Each record is one small event; a few POL lasts a long time. The admin queue shows failed registry writes if it runs dry, and they retry.

Unlocks: public, checkable track records on the maker pages. Money never depends on the chain; a registry outage only delays records.

## 8. A lawyer's pass

- [ ] The **legal pages** (terms, privacy, refunds, delivery, contact, pricing), currently drafts marked as such.
- [ ] The **deed template** (`web/src/deed/DeedText.tsx`, with the same words frozen into each agreement): whether its clauses hold up, whether a clickwrap acceptance (typed name, tick, time, IP) is enough **above some amount**, and what the deed should say about **stamp duty**. Today it says plainly that it is not stamped under the Indian Stamp Act.
- [ ] The **privacy policy** against the DPDP Act, 2023 and its rules, and the **retention periods** (eight years is assumed for money records).
- [ ] That the deed's look can't be mistaken for government stamp paper (no emblem, no "India Non Judicial", no state, no duty value; only Vaada's mark and the deed number).

Unlocks: confidence that a deed means what it says. Changing the wording is a code change: bump `AGREEMENT_VERSION` in `api/vaada/agreement.py` and keep the current text for deeds that carry the old version, since every agreement freezes its version into its hash.

## 9. Backups and incidents

- [ ] **Backups**: turn on Supabase point-in-time recovery for the production project, and once restore a backup into a scratch project to see that it works. The ledger and acceptances are append-only; the database refuses updates and deletes on them.
- [ ] **Who gets paged**: put Sentry (`SENTRY_DSN`) and Railway's deploy and crash alerts on your phone. Add yourself to `ADMIN_EMAILS` so dispute copies and the admin queue reach you. Check `/admin` daily at first: disputes by refund deadline, reconciliation flags, failed transfers and registry writes.
- [ ] **How to pause new deals**: set `NEW_DEALS_PAUSED=true` on both Railway services and redeploy. New deeds can't be sent and new payments can't start; money already held keeps moving on its schedule, and approvals, refunds and disputes still work.
- [ ] **How to export the ledger**: each freelancer can download theirs as CSV from `/ledger`. For everything, `pg_dump --schema=vaada` against the session pooler URL. Razorpay's dashboard remains the record of what actually moved.
- [ ] **If Razorpay is down**: nothing to do. Webhooks are stored before processing and retried, the hold-expiry check runs every minute, and reconciliation flags anything that drifts.

## Also

- [ ] Run `make dev` on a machine with Docker once. This build was verified with native Postgres, Redis, Anvil and Supabase Auth because the build machine couldn't pull Docker images; `make infra` itself has not been run.
- [ ] For each hosted Supabase project, switch on asymmetric **JWT signing keys** (the API only accepts tokens it can check against the project's public keys) and set the email templates (README, "Deploying").
- [ ] Google sign-in (optional): create an OAuth client in Google Cloud, add it under Supabase's Google provider, then set `GOOGLE_SIGNIN_ENABLED=true`.
