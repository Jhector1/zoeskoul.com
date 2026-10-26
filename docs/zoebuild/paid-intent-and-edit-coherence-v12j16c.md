# V12J.16C — One reviewed model across paid semantic intent and source edit

## Verified before this patch

- V12J.16B Mac guarded install `VERIFY_PASS`, five Node tests, four Vitest tests, ZoeBuild `tsc --noEmit` PASS.
- Uploaded `ProjectBuilderShell.tsx` is the exact current browser UI collected from that Mac.
- Canonical $5 Stripe test wallet audit and local signed-event duplicate replay passed; 500,000 units/one grant/one credit lot, balance unchanged on replay.

## What changed

1. In **required paid mode only**, `/assistant/intent` selects the same **compiled production-approved** `openai/gpt-6-luna` as `/assistant/edit`. Previously intent selected an arbitrary economical provider even though paid edit was restricted to Luna. Both operations remain separate idempotent ledger entries, tied to one browser logical attempt ID.
2. No model transport is constructed when the compiled billing registry, independently observed price review, operational approval or provider key is unavailable. An unavailable approval returns `BUILD_AI_BILLING_NOT_READY` (HTTP 503 or SSE failure) rather than a misleading generic auth/credit response.
3. Browser maps this explicit error to a clear message and **does not complete or clear its retry identity**. It never asserts that a Stripe subscription is cancelled or that funds are missing.
4. **No model, funding operation, or provider-spending profile is activated**. Existing registries remain empty. The current browser can still perform normal unmetered operations only while required metering is disabled (existing behavior). Required metering never downgrades to a free/unpriced provider.

## Outstanding before customer spending

- Independently review Luna rates and cache-write retention treatment (30 minutes vs 12 hours), actual provider/account/region, conversion economics and provider usage format.
- Verify OpenAI account and model access and the canonical result-journal migration. Do not print credentials, IDs or DB URLs.
- Close operational evidence for monitoring/alerts, disputes/refunds, uncertain charges, retention, planner route enforcement and retry/reconciliation.
- Commit operator-reviewed source approvals **only after evidence exists**, not from an env flag or test fixture. Then run one bounded intent+targeted-edit attempt and verify both ledger reservations/settlements, provider traces, result recovery, no second provider call on identical retry, and remaining wallet units.

No Stripe, DB, environment, provider, Git or schema changes are made by this installer.
