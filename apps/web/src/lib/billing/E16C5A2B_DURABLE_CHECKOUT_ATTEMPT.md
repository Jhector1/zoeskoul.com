# E16C5A2B — Durable sandbox credit Checkout attempts

This phase creates one database-backed attempt row **before** Stripe Checkout Session creation.
It binds user, price, customer and subsequent Stripe test Session immutably.

* A duplicate attempt cannot create a second Session: either retrieve the recorded Session,
  recover exactly one matching Stripe historical Session, or fail closed.
* A failed Session-recording write fails checkout creation to the caller; on replay,
  historical Stripe recovery can bind the already-created Session.
* Catalog remains EMPTY. Funding mode remains OFF by default. No public purchase route,
  no live/test approved prices, refund/reversal flow, charge authorization, grants, or deployments.
* Stripe session history is a recovery aid, NOT the primary durable idempotency source.
* This source patch includes a Prisma migration file; the guarded installer never runs SQL.
  Apply only to verified local `learnoir_db` after Prisma validation and passing tests.
* Production AI-credit enforcement must remain OFF.

Focused Mac tests:

```sh
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit
pnpm exec vitest run apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.test.ts apps/web/src/lib/billing/zoeBuildAiCreditStripeCheckout.test.ts apps/web/src/lib/billing/zoeBuildAiCreditCheckoutAttempt.test.ts
```

Expected 36 tests (12 funding + 19 checkout + 5 attempt).
