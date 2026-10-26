# V12J.15B — Verified funding and metered editing review

Status: **read-only audit tooling, conditional signed local replay; model activation remains off.**

## Proven scope

- Test sandbox $5 Stripe Price -> 500 nominal credits -> 500,000 canonical units.
- Web signed `checkout.session.completed` and payment-intent source-key dedup remain canonical.
- Audit requires all: test-mode Stripe GET verifies Checkout, single line, PaymentIntent, latest Charge, exact amount/currency, no refunds/dispute; immutable authenticated DB checkout owner; one purchased lot; exactly one grant ledger entry; one **already processed** Stripe event; no funding-risk events or wallet freeze.
- `--audit` selects a DB with an operator-confirmed database name and role and performs **SQL BEGIN READ ONLY**. It cannot grant credits and prints no IDs or secrets.
- Optional `--replay-local --confirm-signed-test-event-replay` submits an actual **already processed** Stripe event, signed locally with the currently configured test webhook secret, to **127.0.0.1:3000** only, then checks the same lot, balance, event and attempt count. If the Web process uses another signing secret, the request is rejected, and the script reports refusal rather than hiding it.
- It performs **no Stripe POST**, customer checkout, AI provider request, refund or dispute mutation. Not a production-readiness approval.

## Cost and capacity research (not activated)

OpenAI official public standard API pricing checked 2026-10-23:
- `gpt-6-luna`: $0.10 per million input tokens, $0.50 per million output tokens.
- `gpt-6.1-sol`: $2.00 per million input tokens, $10.00 per million output tokens.
- Source: https://developers.openai.com/api/docs/pricing and https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Pricing is subject to processing tier, context length, tool charges and regional fees. Do not infer provider billed output merely from user-visible text. Caches, tools and reasoning must be included in the verified usage receipt.

**Planning-only hypothetical**: 20,000 input + 4,000 output token maximum at standard US/global rates (assumes no hidden fee tiers, extra tools or long-context uplift): Luna $0.004 provider max (0.4 nominal cents), Sol $0.08 provider max (8 nominal cents). Under a hypothetical 2x markup and $0.01 nominal credit value, corresponding unit reserves would be Luna 800 internal units (0.8 nominal credits), Sol 16,000 units (16 nominal credits). These are not certified reservation ceilings: a provider input token cap, output/reasoning ceiling, pricing version, account tier and full operational review must be independently verified before activation. The *existing* derived reservation policy must calculate the actual bound, not a hardcoded example.

**Product design**: prefer Luna for focused, inexpensive edits and Sol for harder tasks after grounded task complexity selection; never route by simple word lists. Do not promise an arbitrary fixed per-edit price. Reserve before the OpenAI call, settle from provider-verified usage, hold uncertain results, avoid duplicate provider calls, and release unused units only after guaranteed safe outcome. The source-controlled arrays `ZOEBUILD_VERIFIED_AI_BILLING_PROFILES` and `ZOEBUILD_APPROVED_BILLING_OPERATIONS` remain EMPTY.

## Still pending

- Proof from user's actual Mac read-only audit output and local signed event replay.
- Independent review of model input/output enforcement; context length tier; tool charges; region, account, cache and the actual OpenAI billing response for the editing route.
- Validated reserve/settle+refund/dispute operational playbook and loss bounds before enabling customer metering.
- Production deployment and alerting acceptance.
