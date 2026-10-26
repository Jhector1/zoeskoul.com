# ZoeBuild product contract: subscription vs. AI credits (V12J.13C)

**Status:** reviewed product design and truthful billing copy; **NOT a production billing activation**. The existing Stripe test product remains unchanged until the migration outlined below is fully implemented and validated.

## Product principle

**Subscription = capability and platform limits. AI credits = paid inference usage.** Keep a user's feature grant (`FeatureGrant`) independent from a user's AI wallet (`AiCreditWallet`/`AiCreditLot`). A subscription may optionally include a stated number of AI ledger units per paid period, but it does **not** make inference unlimited. Purchased credits should be usable for ordinary AI prompts without requiring Builder Pro once the target architecture is released.

### Target launch tiers (proposed; NOT yet active)

| Capability | Free account / credits only | Builder Pro subscription | Metered separately? |
| --- | --- | --- | --- |
| Create projects from registered deterministic templates | Yes, with bounded quotas | Yes, higher quotas | No AI charge |
| Code editor, preview, manual edits | Yes | Yes | No AI charge |
| Basic Zoé contextual chat, plan, simple build, targeted edit | With purchased AI credits and abuse limits | With AI credits | Yes, only real paid AI operations |
| Advanced multi-file agent tasks and richer contextual automation | No | Yes, after implementation | Yes, if AI used |
| Extended project version history and restoration | Limited | Yes, after implementation | No AI charge |
| Publishing/hosting | Limited free deployment after implementation | Higher limits after implementation | Compute/hosting resource rules, NOT AI wallet |
| Custom domain | No | Yes, after implementation | Domain registration remains external cost |
| Provision database/auth/storage integrations | No, or limited integrations | Yes, after validation of per-project provider connection | Provider costs not AI inference credits |
| Extended preview/build compute | Basic limits | Higher limits | Infrastructure quotas/overages, NOT AI wallet |
| Team workspaces and roles | No | Separate future Team tier | Not part of current test product |

Do not market unimplemented capabilities as available. Connecting merchants' Stripe/Shopify/Neon/etc. uses per-project provider credentials and the provider's own charges; a ZoeBuild subscription does not pay merchants' transaction fees or cloud bills.

### Current implementation (as of V12J.13B)

- Existing verified `builder_ai` Stripe subscription projects **two revocable subscription-owned grants**: `build_ai_generate`, `build_ai_edit` (`buildAiSubscriptionPolicy.ts`). This is **not** yet the target credits-only basic AI rule.
- `build_ai_edit` is checked in `assistant/edit`; `assistant/intent` checks the edit grant in required-metering mode. **Do not bypass either live check** before migrating all routes and source-apply gates together.
- The canonical AI ledger has independent *subscription* and *purchased* lots and before-call reservation/after-call settlement/replay. An active subscription alone does **not** create spendable lots unless a verified funding/allowance event explicitly grants them.
- The compiled pricing and operational approval registries are empty. AI credit spending, credit packs and production paid AI activation remain disabled.
- The displayed $15.25/month is the **existing Stripe test-mode price** from the configured catalog, not approval of public Builder Pro pricing or an automatic AI-unit allowance.
- The DB `FeatureKey` enum currently includes `build_ai_generate` and `build_ai_edit`; the application package lists future platform-level entitlement strings but they are **not** verified grants in PostgreSQL yet.

### Target runtime policy (requires coherent, separate implementation)

1. Implement canonical platform grants for separately testable Pro features (`custom domain`, `advanced publishing`, `extended history`, `database/auth/storage`, `extended compute`, `advanced multi-file agent`) using the **same database schema and runtime logic in dev and production**. Do not assume a listed application entitlement is already a DB-enforced FeatureGrant.
2. Migrate the Stripe Builder product's verified-grant projection from gating *all* AI generation/editing to gating only Pro features. Keep Stripe as the source of truth for subscription lifecycle and revocation. Existing tests that expect the old two grants need coordinated replacement; avoid shims or duplicate entitlements.
3. Enforce basic AI chat/build/edit as: valid authenticated user and authorized project + approved metering policy + sufficient unexpired ledger units + rate/resource limits. For advanced agents, also require an active canonical Pro feature grant. **Never infer payment/entitlement from wallet balance, client input, or HTTP redirect.**
4. Bind every paid provider invocation to a verified model price, max token cap, credit-unit conversion, reserved wallet units and durable usage receipt. Reuse the existing shared ledger, provider operation ID, encrypted result journal and replay. Never charge AI credits for deterministic operations, ordinary manual editing, or API calls blocked before provider dispatch.
5. Separate AI spend from infrastructure spend: preview/build compute, deployed hosting, database storage, domains and merchant payment processing must be transparently quota-metered/invoiced or externally paid, not silently debited as AI credits.
6. If Builder Pro includes monthly AI units, decide the exact **number only after verified model-unit economics**, grant once per Stripe-verified paid subscription period, dedupe by period source key, expire included units at period end, and reverse correctly after refunds/chargebacks. Purchased credits are their own source lot; choose and disclose expiration/refund terms after legal/payment review. Avoid pricing promises not supported by the current catalog.
7. Enforce ownership and authorization in server routes for every capability. Update the subscription plan UI, pricing tables and account status only after backend and end-to-end tests pass.

### Acceptance and release sequence

**Phase A — Existing test checkout (now):** use the current Builder AI test plan, verify `mode=test`, complete one Stripe test-card checkout, confirm verified checkout return, signed webhook processed, owned active subscription and both **current** grants. Confirm AI ledger units remain independent. No provider call and no production activation. Do not click repeatedly if callback is unreconciled.

**Phase B — Product migration:** implementation of the target policy above in a coherent schema+feature+route+UI batch with production-identical business logic. No hidden dev-only bypasses.

**Phase C — Pricing and credit funding:** register separately reviewed pricing and operational evidence (not merely environment toggles); test synthetic wallets and real test-provider calls, limit maximum spend, validate refund and expired/replayed requests. Customer credit packs remain disabled until paid-event reversal acceptance.

**Phase D — Release:** actual browser access and Stripe webhook acceptance, automation, alerts/retention, feature provisioning evidence, tested revocations, and explicit production sign-off.

### Stripe test-mode acceptance (use your existing logged-in browser)

1. Open ZoeBuild **Billing** and verify the server-backed billing mode is **test** and the expected Builder price appears. Do NOT proceed if the UI reports **Live Stripe mode**.
2. Click **Continue to Stripe test Checkout**. On Stripe's verified `checkout.stripe.com` page use the **test card** `4242 4242 4242 4242`, any future expiry, any three-digit CVC. This is a test-mode transaction; no real money should move.
3. Return to ZoeBuild Billing; allow the app to reconcile its signed webhook. The success URL alone is never proof of payment. If it says **paid_unreconciled**, refresh/status-check instead of submitting checkout again.
4. In your same authenticated browser open `/api/billing/verification` on the ZoeBuild origin. Verify only sanitized flags: `mode: test`, `customerLinked`, `subscriptionActive`, `webhookProcessed`, `generateGrant`, `editGrant`, `checkoutReturn` (expected verified when checkout return is available). **Never share Stripe IDs, cookies or keys.**
5. Check **Billing → AI credit balance**: grants become active; `subscriptionAvailableUnits` and `purchasedAvailableUnits` are independent. A zero balance is not a webhook failure.
6. Through the Stripe **test** portal, cancel at period-end and test the scheduled grace period and end-of-period revocation. Separately validate immediate cancellation, resume and duplicate webhook deliveries; existing automated acceptance can be reused before changing the entitlement model.
7. Leave production reviewed AI-pricing arrays empty and customer credit purchases disabled until the separate spending approval gate is closed.

Reference: Stripe's official test payment documentation: https://docs.stripe.com/testing
