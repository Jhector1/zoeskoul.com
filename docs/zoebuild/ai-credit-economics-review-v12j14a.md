# V12J.14A — AI credit economics review (NOT activation)

**Scope:** internal proposal for a subscription/credit separation and cost verification. No customer wallet is funded, no credit pack sold, no provider request made, and no pricing or operations registry approved by this patch.

## Evidence and reviewed rates

Source: OpenAI per-model documentation (`https://developers.openai.com/api/docs/models/gpt-6-luna` and `https://developers.openai.com/api/docs/models/gpt-6.1-sol`). Existing source snapshots in `publishedModelPriceReviews.ts` were observed on **2026-10-19** and expire after **seven days**. The Oct 23 review validates the still-current official provider text-token rate matrix but does not extend the original recorded observation time or activate approved pricing.

| Provider global Standard rates per 1M billed tokens | GPT-6 Luna | GPT-6.1 Sol |
| --- | ---: | ---: |
| Ordinary input | $0.10 | $2.00 |
| Cached input | $0.01 | $0.10 |
| Cache write | $0.125 | $2.50 |
| Output (including reasoning) | $0.50 | $10.00 |

All estimates apply only to the global Standard endpoint with text tokens, without regional premiums, image/video/audio, tools, long context, Batch/Flex/Fast or other fees. These must be separately reviewed before expanding allowed functionality. **The quoted input reserve uses the most expensive input category, including cache writes**, not simply the ordinary input rate. Never estimate an actual billable token ceiling from characters or the client's declared size.

## Explicitly hypothetical unit economics

The offline worksheet uses **1 illustrative credit = $0.01 nominal**, **1,000 ledger units per illustrative credit**, **2x provider-cost multiplier** (to cover operational overhead and risk; not an approved public markup). The resulting net ledger-unit value is **$0.00001 nominal per ledger unit** before 2x multiplier. These are assumptions, not actual subscription allowances, credit-pack prices, or refunds policy.

Example *strict reservation* for a tiny provider request with a provider-verified maximum of 512 total input tokens and 256 total output tokens, including reasoning: **Luna: $0.000192 = 39 illustrative ledger units**; **Sol: $0.003840 = 768 illustrative ledger units**. Both model ceilings are theoretical until the server independently enforces the provider's billable token counts and output limits. These are conservative allocations, not charges for actual usage. The ledger settlement uses the provider's real token receipt and releases the unused hold.

The running customer's reported balance is **0 units**, and the subscribed account has two active existing grants. **Do not call an AI provider using this customer's wallet until real verified funding, reviewed model policy and operational approval all exist.** In the proposed target model, basic credit-metered chat/build/edit should not require a subscription, while Pro controls advanced capabilities. That entitlements migration must touch all authorization/apply gates together, not just the UI.

## Funded usage architecture to implement next

1. **Provider-verified funding event only.** Inspect the current Stripe webhook/payment intent adapters and project billing catalog before adding a customer credit-pack SKU. The browser must never nominate the number of units, price, credit source key or target user.
2. **Immutable server-priced pack catalog.** Decide audited USD pack price, ledger-unit quantity, charge/refund policies and price version. Keep one matching catalog in dev/prod; Stripe TEST and LIVE keys differ, business rules do not.
3. **One grant per settled, verified payment.** Verify server-side that Stripe payment is `paid`, belongs to the authenticated canonical user/Stripe customer and intended product/price, and is not already funded. Call existing `grantAiCreditLot` with `kind:purchased`, `origin:verified-stripe-payment`, immutable Stripe source key and agreed units. Do not treat redirects or unsigned webhook metadata as funding proof.
4. **Refunds and disputes.** Reuse the canonical verified Stripe risk-freeze/reversal rules. Verify simultaneous reservation and partial/full refund conservation, deduplicated risk events and negative outstanding liability; never turn a chargeback into a free wallet reset.
5. **Billing reconciliation.** Existing Builder AI subscription grants must stay controlled by Stripe. A subscription's included AI allowance is **zero today**. If a plan will include units, verify an invoice-paid period and grant once per paid period with period-end expiry and correct refund behavior. Never backfill a monthly allowance solely from an active status badge.
6. **Provider metering.** Register exact model rate and usage evidence only after the independent seven-day review and provider account scope audit, conversion economics, funding tests, route enforcement and uncertain-charge reconciliation. No `NODE_ENV` switches or production/dev schema discrepancies.
7. **User acceptance.** Use the existing subscribed account on ZoeBuild after approved funding. One small authorized text-only edit should yield a *proposal*, never auto-apply. Inspect ledger reservation, actual provider receipt, encrypted journal settlement, and same-tab retry zero-duplicate spending. A read-only renewed session check beyond 30 minutes is separate.

## Release gates

- Gate 1: existing Stripe test subscription + canonical `build_ai_generate` and `build_ai_edit` grants — **validated in authenticated browser**.
- Gate 2: exact published model rates + hypothetical conversion unit review — **offline worksheet only**.
- Gate 3: signed Stripe test pack payment -> canonical purchased lot -> refund/chargeback — **not implemented/activated for current customers**.
- Gate 4: source-reviewed model billing profile and independent operational sign-off — **empty; must remain empty**.
- Gate 5: real logged-in browser AI edit + one charged request + journal replay with verified funded wallet — **pending**.
- Gate 6: independent production financial/operations sign-off — **pending**.

### Safe offline commands

```
node --experimental-transform-types --test packages/db/scripts/zoebuild-ai-economics-v12j14a.unit.test.mjs
node --experimental-transform-types packages/db/scripts/zoebuild-ai-economics-v12j14a.mjs --report
```

The JSON report is for operator review only, never a customer quote. Refresh the source evidence if the test refuses after seven days. Never change `observedAt` without new independent provider verification.
