# E16C4E1B2B2A — Original-response settlement recovery (guarded source patch)

This phase closes a recoverable gap without pretending timeouts, response identifiers, or uploaded operator evidence prove billing.

## Behavior

1. The metered executor already binds its pre-dispatch identity, captures the provider response ID, checks actual provider/model/tier/input/output, and prices exact usage.
2. **NEW:** After all validation, it saves the immutable provider-response usage digest and exact reviewed cost/pricing version with the response identity in a separate database transaction, **before** the ordinary wallet settlement.
3. On a later settlement failure, a server-internal entrypoint `settleAiCreditsFromRecordedProviderReceipt` can recover solely from this original validated receipt; it does not accept the cost/price from the caller.
4. Recovery uses the existing per-user wallet row lock and finalizes the lot allocations, ledger entries, reservation status, reconciliation case and resolution audit in one DB transaction; conflicting replay and over-reservation remain blocked.
5. If response metadata is missing, pricing/tier checks fail, receipt persistence fails, the provider timed out without an HTTPS response, or the charge exceeds the hold, funds stay RESERVED pending investigation. `store: false` means there is no general replay/retrieval guarantee.

## Trust limitations

The digest is NOT a provider digital signature. The frozen receipt is trusted ONLY because the server records the original authenticated HTTPS transport result immediately after its own existing pricing and usage safeguards. Calling the exported primitive outside this trusted server path with invented amounts would be unsafe; do not expose it in a generic route. Do not use this recovery path for uploaded invoices, provider support references, operator assertions, expired holds, or presumed zero bills. Those still require independent provider verification and separate authorized resolution. No API for `not_billed` release is added.

## Scope

- 7 existing source/test files updated, 2 new files added (this note and a migration).
- The installer **does not** execute SQL, run Prisma, grant/release/settle funds, contact Stripe/OpenAI, wire routes, modify Git, push or deploy.
- The recovery function is inert unless called by trusted server code; it is not connected to public routes or background jobs.
- No Stripe funding or live AI charging configuration enabled; production model/rate approval registries remain untouched/empty.

## Mac commands

From `/Users/admin/Documents/NextJSProject/zoeskoul-web-infra`:

```sh
python3 ~/Downloads/zoebuild-e16c4e1b2b2a-original-response-recovery-guarded.py "$PWD" --diff
python3 ~/Downloads/zoebuild-e16c4e1b2b2a-original-response-recovery-guarded.py "$PWD" --apply
```

Then validate + generate Prisma with DATABASE_URL from `.env.shared.local` and the established localhost/learnoir_db preflight (do NOT print URL or migrate a nonlocal target); this does **not** automatically apply migration.

```sh
pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit
pnpm exec tsc -p apps/zoebuild/tsconfig.json --noEmit
pnpm exec vitest run packages/platform-server/src/ai-credits/aiCreditLedger.test.ts packages/platform-server/src/ai-credits/aiCreditProviderRequest.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliationAssessment.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliationEvidence.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliation.test.ts
pnpm exec vitest run packages/ai-json/src/openai.request-identity.test.ts
cd apps/zoebuild
pnpm exec vitest run src/lib/build/meteredAiJsonExecution.test.ts
```

Expected **85 focused tests** (8 ledger + 11 request + 10 assessment + 9 evidence + 7 journal + 2 OpenAI + 38 metered); 19 ledger/request tests were exercised here with a standalone TS-transpile/memory-client harness. Full workspace Prisma, TypeScript, and Vitest checks still require your Mac.

Once all checks pass, validate `prisma migrate status` against the verified local development DB and apply ONLY expected migration `20261019233000_e16c4e1b2b2a_trusted_provider_receipt`. Do not auto-deploy to any remote/prod database.

## Remaining project tasks

- E16C4E1B2B2B: Independent provider account/invoice verification and authorized manual resolution for missing original response / credible zero-billing outcomes; operator-authenticated workflow and controls. Uncertain timeouts remain held.
- E16C5: Stripe-funded purchased lots and subscription credits, paid-event idempotency, refunds/disputes, matching test/live environments.
- E16C6: Production-reviewed model/rate approvals and gated generation/edit routes, final full billing E2E and controlled rollout.

`ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` remains OFF.
