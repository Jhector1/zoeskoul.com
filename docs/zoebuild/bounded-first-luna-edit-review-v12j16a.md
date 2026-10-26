# V12J.16A — First bounded, customer-funded Zoé edit review

**Status: PRICING REVIEW CANDIDATE; NOT ACTIVE.** Both production approval registries remain empty. This patch cannot issue AI requests or spend a customer's purchased credits. The existing authenticated targeted-edit route already selects the server-owned metering transport when required, but model pricing and separate operational approval must be source-reviewed before activation.

## Funding evidence already established

- An authenticated **$5 Stripe test payment** funded a single purchased lot with **500,000 canonical units** (= 500 nominal credits).
- Signed webhook replay returned HTTP 200 with exactly one lot/grant and unchanged balance (per Mac user-provided logs). This proves this one test transaction, not refund/dispute/runbook production readiness.
- Existing subscriptions and AI entitlements remain separate from purchased metered units. Do not subscribe again.

## Reviewed model rate candidate (Oct 23, 2026)

- GPT-6 Luna Standard/global: $0.10/million uncached input; $0.01/million cached input; $0.125/million 30-minute cache write; $0.50/million output, including hidden reasoning tokens counted within the output cap.
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/pricing
- Requests with >272,000 input tokens use higher long-context pricing, so the bounded profile rejects at **20,000 provider-counted total input** tokens. No tools, media, region-specific or premium processing are in scope.
- Proposed output cap: **4,096** provider-enforced `max_output_tokens` including reasoning.
- The strict upper-bound arithmetic must consider the most expensive possible input category, cache **write** at $0.125/million. This produces a **$0.004548** maximum provider text-only cost (`20,000 * 0.125 / 1,000,000 + 4,096 * 0.50 / 1,000,000`).
- Hypothetical, **NOT APPROVED** consumer economics: 1 credit = $0.01 and 1,000 internal units; 2x provider cost markup. Proposed conservative reserve **910 units** (= 0.91 credits) for one maximum request; actual unit charges must use provider usage and refund the unused reserved units, not the maximum example.
- The rate evidence has a 7-day freshness gate. A later run must re-review it; never silently extend a verification date.

## Required before first customer-funded edit is turned on

1. Review provider account processing tier/region and cache-write duration; ensure absence or correct billing for extra tools/media/third-party fees.
2. Confirm transport's provider-enforced output cap covers all hidden/reasoning tokens; use actual `responses/input_tokens` count for the exact schema/system/user envelope, with a 20,000 hard refusal before wallet reservation.
3. Independently approve user credit conversion/markup and bound worst-case margin loss (2x used here is only a proposal).
4. Verify authenticated source-edit route and operation-ID replay with an already funded real wallet; one provider request, one settlement, and stable replay; no simulation/wallet mutation without explicit authorized acceptance.
5. Verify credit reservation uncertainty reconciliation, alerting, refund/dispute handling, retention, account permissions, and cost monitoring across supported deployment environments.
6. Register an independently signed, source-controlled pricing profile and a distinct operational approval only after that evidence is captured. Do **not** enable with `NODE_ENV` checks, synthetic DB grants, shadow billing, or a test-only editing route.

## Testing / next source handoff

Run `pnpm --filter @zoeskoul/zoebuild exec vitest run src/lib/build/boundedLunaEditReviewV12J16.test.ts` then typecheck. The test-only candidate is *not wired* into the production allowlist. Run `python3 packages/db/scripts/collect-zoebuild-metered-edit-v12j16a.py "$PWD" "$HOME/Downloads/zoeskoul-v12j16a-metered-edit-current-source.zip"` and upload that archive to prepare the source-accurate operational acceptance patch.
