# E16C5B2A — cumulative refunded-credit reversals (source-only)

This stage is **sandbox-only**, and it is **not** sufficient to activate live sales.

## Financial semantics

- Signed Stripe refund/charge events are lookup hints. The server independently retrieves the Charge, requiring a paid, captured USD payment with a canonical ZoeBuild funded lot.
- Under the existing per-user wallet row lock, **only confirmed cumulative `Charge.amount_refunded`** drives a nondecreasing refund target: `floor(grantedUnits * refundedMinor / chargedMinor)`; an exact full refund targets the full granted lot.
- The corresponding available units move into a distinct `reversedUnits` bucket, never into `consumedUnits` or deleted history. Ledger entries record `reverse` deltas; immutable cumulative snapshots record amounts, applied units and initial shortfall.
- Any outstanding target not yet reversed is recorded as `reversalShortfallUnits`. Credits still reserved are **not** confiscated; if they later settle with unused release, that released portion is immediately reversed under the same wallet lock, and its ledger entry captures both deltas.
- A Stripe dispute, even if under review, freezes the wallet but does not automatically claim a permanent refund. The freeze remains until a distinct authorized review process.
- Reprocessing the same cumulative refunded amount cannot reverse more units. Stale observations never reduce the target.
- Invariant after reconciliation: `grantedUnits = availableUnits + reservedUnits + consumedUnits + expiredUnits + reversedUnits`; `reversalTargetUnits = reversedUnits + reversalShortfallUnits`.

## Deliberate limitations

- **E16C5B2B remains necessary** to persist verified Stripe risk occurring *before* a purchase grant and serialize that risk with grant creation. Current E16C5B1 logic returns `not_funded` when there is no lot. Do not activate sale flows yet.
- There is no automated dispute-loss reversal and no authorization to unfreeze; no subscription grant or public Checkout route is added.
- The new schema migration must be applied only after Prisma generation, TypeScript, and focused tests succeed, and only on verified local `learnoir_db` with this migration alone pending.
- No code changes production pack approval, Stripe environment selection, or `ZOEBUILD_AI_CREDITS_ENFORCEMENT`.

Focused test command:

```sh
pnpm exec tsc -p packages/platform-server/tsconfig.json --noEmit
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec vitest run packages/platform-server/src/ai-credits/aiCreditLedger.test.ts apps/web/src/lib/billing/zoeBuildAiCreditStripeRisk.test.ts apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.test.ts apps/web/src/lib/billing/zoeBuildAiCreditStripeCheckout.test.ts apps/web/src/lib/billing/zoeBuildAiCreditCheckoutAttempt.test.ts
```

Expected 64 tests (18 ledger + 10 risk + 12 funding + 19 checkout + 5 attempt). No production activation.
