# E16C5B1 — Verified Stripe refund/dispute risk quarantine

## Precise scope and guarantee

- The existing signed Stripe webhook obtains only the external object ID from a
  refund, charge refund or dispute event. The risk verifier independently
  fetches the live provider-managed Refund/Dispute **and** its Charge.
- The current Charge must match the independently fetched resource, be paid,
  captured, USD, have valid amounts, and contain a PaymentIntent linked to an
  **already granted ZoeBuild purchased credit lot** (canonical source key).
- A provider-verified risk signal atomically logs one immutable event and
  freezes **new** AI credit lots/reservations under the existing per-user wallet
  row lock. Duplicate webhooks cannot create duplicate journal entries.
- Existing reservations still settle or release under normal verified-cost
  rules. Consumed units and existing ledger history are **never erased**.
- The freeze is deliberately sticky, including after a dispute is won or a
  refund fails, pending a separately authorized review/resolution workflow.
- Existing tutoring and subscription billing flows remain in their existing
  handlers. Events for non-ZoeBuild payments fall through or are ignored.

## Deliberate boundaries

This is **NOT** a credit reversal or complete refund/dispute implementation.
It does not determine the proportional unspent-credit debit, loss/shortfall,
recovery of already consumed units, eligibility to unfreeze, customer dispute
resolution or financial chargeback accounting. Those belong in E16C5B2.

A payment reversed *before* its funding grant exists is not persisted by this
lot-linked risk flow; E16C5A1 rechecks current Stripe payment state before
any grant, but a checkout-verification/DB-grant race still needs a separate
serialized funding-state safeguard in E16C5B2. Do **not** enable credit sales
based on E16C5B1 alone. Do not activate a public Checkout route.

The compiled approved credit-pack list stays EMPTY. Production funded credits,
AI enforcement, migrations, Stripe price or provider approvals are NOT turned on.
No operator evidence can invoke this automatically. No public API is attached.
The installer only writes scoped source/migration files, never connects to a DB.

## Mac validation

1. Apply the guarded installer only after reviewing `--diff`.
2. Validate Prisma and regenerate Prisma Client **using the established local**
   `.env.shared.local` verification; **do not deploy SQL yet**.
3. Run from monorepo root:

```sh
pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec vitest run \
  packages/platform-server/src/ai-credits/aiCreditLedger.test.ts \
  apps/web/src/lib/billing/zoeBuildAiCreditStripeRisk.test.ts \
  apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.test.ts \
  apps/web/src/lib/billing/zoeBuildAiCreditStripeCheckout.test.ts \
  apps/web/src/lib/billing/zoeBuildAiCreditCheckoutAttempt.test.ts
```

Expected **57 focused tests** (12 ledger, 9 risk, 12 funding, 19 checkout,
5 checkout-attempt tests). The first 21 ran in an isolated TypeScript-transpile
harness; real Prisma/typecheck/Vitest still require your Mac.

4. Only after all checks, verify pending migration list equals exactly
   `20261020022000_e16c5b1_stripe_payment_risk_freeze` against local
   `localhost:5432/learnoir_db` before applying. Never migrate remote/prod.
