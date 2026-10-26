# E16C5A2A — Sandbox-only ZoeBuild AI credit Checkout preparation

This patch adds a server-internal Stripe Checkout construction capability for approved
one-time USD credit packs. It reuses E16C5A1's compiled pack validator and marks
created Checkout Sessions and PaymentIntents for the existing signed-webhook
fulfillment path.

## Safety and state

- The approved pack list remains **EMPTY**. `ZOEBUILD_AI_CREDIT_FUNDING_MODE`
  defaults to `off`; only the explicit `sandbox-only` value is recognized.
- No public purchase API, UI purchase button, credit grants, subscriptions,
  refunds, disputes, migrations, real charges or production enablement.
- The user ID must come from an authenticated/authorized server session. The
  internal function must never accept a browser-supplied user ID.
- The Stripe price MUST be active, test-mode, one-time, USD, fixed-unit,
  exactly matching a compiled approved pack. Existing customer must belong
  to that internal user and Stripe test mode, not browser metadata.
- Stripe idempotency-key retention is finite. This source-only stage is NOT a
  lifetime exactly-once purchase guarantee; a durable attempt record is required
  before exposing any public purchase route.
- Repeat attempts first search the customer's Stripe Checkout history and
  compare ownership, metadata, price and line item; if history is truncated,
  or attempts conflict/expire, fail closed. Concurrent retries also send a
  deterministic Stripe idempotency key. Neither refunds nor failed sessions
  are silently converted into new purchases.
- Success/cancel URL origins are validated, and promotion codes and automatic
  tax are disabled. No user-provided URL is accepted.
- The server adapter does **not** create Stripe customers. A separate,
  authenticated flow must establish and securely associate that customer.
- `cs_test_...` is a traceable Checkout identity, not payment confirmation.
  Credits are granted only later, by the existing E16C5A1 webhook verifier.

## Mac validation

```sh
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit
pnpm exec vitest run \
  apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.test.ts \
  apps/web/src/lib/billing/zoeBuildAiCreditStripeCheckout.test.ts
```

Expected: **26 tests** (12 existing funding + 14 new checkout). No Prisma migration
is introduced or should be run for this phase.

## Follow-up requirements

1. Implement signed refund/chargeback reconciliation and spend/reversal policy
   before considering live packs or live payments.
2. After review, approve explicit sandbox test packs, wire the authenticated
   purchase endpoint and UI, establish new/customer mapping safely, and test
   simulated Checkout-to-webhook-to-ledger end-to-end.
3. Complete subscription period funding, live AI routes, final pricing/operational
   approvals and controlled rollout.

Production `ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` remains OFF.
