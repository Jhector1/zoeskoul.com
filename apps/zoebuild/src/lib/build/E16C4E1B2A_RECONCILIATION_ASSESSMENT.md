# E16C4E1B2A — Read-only held-charge case assessment

The reconciler now has an immutable operator-claim evidence journal (E16C4E1B1)
with its local database migration applied. E16C4E1B2A adds a **read-only**,
tenant-checked case assessment. It can distinguish missing evidence, conflicting
claimed bills, unpriced or unknown outcomes, invalid records, finalized
reservations, and internally consistent claims that still need independent
provider verification.

**Security boundary:** Even a self-consistent evidence record with a provider
invoice number and SHA-256 digest does not authenticate the provider, identify
the paid request unambiguously, or prove a provider did not bill. EVERY
assessment returns `monetaryResolutionAllowed: false`. There is no settlement,
release, automatic timeout refund, operator approval, new API route, or wallet
write. Callers must authenticate/authorize internal operators themselves.

The supplied owners snapshot shows OpenAI Responses uses `store: false` and the
AI JSON return type does not include a persistent response ID bound to the
original reservation. Therefore implement **no** wallet resolver from these
operator claims. Before financial E16C4E1B2B, bind independently verifiable
provider-origin charge records to the original request (or document an
independently authenticated provider account/invoice support case with
credible request linkage); design separate strict operator authorization and
atomic wallet+resolution audit transaction using existing wallet locking.
Some unknown outcomes may remain held pending manual investigation.

## Local validation

- `pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit`
- `pnpm exec tsc -p apps/zoebuild/tsconfig.json --noEmit`
- `pnpm exec vitest run packages/platform-server/src/ai-credits/aiCreditReconciliationAssessment.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliationEvidence.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliation.test.ts`
- From `apps/zoebuild`: `pnpm exec vitest run src/lib/build/meteredAiJsonExecution.test.ts`

No Prisma schema change or new migration in this phase. Do not deploy, push,
change production billing, or enable `ZOEBUILD_AI_CREDITS_ENFORCEMENT=required`.
