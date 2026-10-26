# E16C4E1B2B1 — Durable provider request linkage (SOURCE ONLY)

Creates a durable one-to-one row between the reserved wallet charge and a unique
server-generated request trace, committed **before** the outbound paid generation.
The OpenAI Responses request carries `X-Client-Request-Id`, and on success we
persist the provider JSON response ID and optional `x-request-id` header before
wallet settlement. A failed DB binding prevents the paid dispatch. Missing or
unpersistable response identity holds funds for investigation, not release.

OpenAI documents X-Client-Request-Id as a way support can investigate requests
when network timeouts prevent receipt of x-request-id. A trace ID is NOT proof
of provider billing, and no new settlement/release authorization is exposed.

The new migration only adds a provider-request identity table and indexes. It
must be separately validated against the verified local development DB and
applied **only after approval**; this installer changes source files, never DB.
The old user balance/ledger primitives are not modified. No API or UI routes,
Stripe financial credits, Git push, deployment, or production enforcement.

There is intentionally no automatic financial resolver yet. Provider-ledger
reconciliation must independently authenticate a provider response/invoice,
verify its pricing and original request linkage, and write the finalization
and audit atomically under wallet lock. Unknown outcomes remain held.

For test run (after prisma validate and generate from `.env.shared.local`):
- `pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit`
- `pnpm exec tsc -p apps/zoebuild/tsconfig.json --noEmit`
- `pnpm exec vitest run packages/platform-server/src/ai-credits/aiCreditProviderRequest.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliationAssessment.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliationEvidence.test.ts packages/platform-server/src/ai-credits/aiCreditReconciliation.test.ts packages/ai-json/src/openai.request-identity.test.ts`
- from `apps/zoebuild`: `pnpm exec vitest run src/lib/build/meteredAiJsonExecution.test.ts`

`ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` remains OFF.
