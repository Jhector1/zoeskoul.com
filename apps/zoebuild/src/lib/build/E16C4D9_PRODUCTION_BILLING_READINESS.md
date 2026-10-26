# E16C4D9 — Production AI billing approval readiness (NO activation)

## Current status: BLOCKED

Both ZoeBuild's reviewed model approval list (`ZOEBUILD_VERIFIED_AI_BILLING_PROFILES`)
and new operational approval list (`ZOEBUILD_APPROVED_BILLING_OPERATIONS`) are
**EMPTY**. Neither GPT-6 Luna nor GPT-6.1 Sol may be billed through production.
The D6 published Standard prices are **source observations, not approvals**, and
expire seven days after the recorded 2026-10-19 review unless independently
refreshed. D8 endpoint checks are NOT provider-attested processing-region proof.

## Independent approval requirements — all must have reviewed evidence

| Requirement | Current state / needed work |
| --- | --- |
| Exact model rates, cache reads/writes, long-context and output caps | D6/D7/D8 reviewed locally; reverify current rate and model terms before approval |
| Provider account processing region, residency, Standard-tier pricing | D8 restricts endpoint; separately audit account/project and invoice processing region |
| Credit conversion economics and minimum reserve coverage | Deterministic conversion exists, but credit unit value, markup and loss bounds require business approval |
| Verified payment-funded credit lots, duplicate events, refunds and chargebacks | Funding workflow NOT certified; implement and test real signed paid-event grants and reversals |
| Unknown provider outcome and held reservation reconciliation | Executor preserves holds; durable resolution, retries, accounting and operator visibility NOT certified |
| Generation and targeted edit route enforcement | Metered planner primitive exists; production authenticated generation/edit routes NOT wired |
| Operational monitoring, support workflow, incident/dispute evidence | No reviewed operational sign-off; add aged-hold alerts, investigation and audit-retention tests |

`productionAiBillingReadiness.ts` introduces a distinct **source-controlled,
model/version-bound, short-lived operational review contract**. It checks six
independent evidence *references* plus exact model, price-version, conversion-
version, global endpoint, Standard tier, reviewer and freshness. These fields
are **not proof of external system functionality**; an operator must perform the
actual reviews and supply verified evidence **after** implementing missing work.
Pure unit-test fixtures can validate the contract but cannot populate production
registries. Production resolution now requires D2/D3 evidence, D6 exact rates,
**AND** the D9 operational sign-off, in that order.

## No activation

This patch adds no real approved model profiles, operational approvals,
Stripe grants, funded lots, reconciliation workers, live routes, migrations,
provider calls, Git commits, secrets, deployment, or billing activation.
Keep `ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` **disabled** until all cited
systems exist, have passed end-to-end tests and have independently reviewed
operator sign-off. Do not copy the synthetic unit-test references into production.
