import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const acceptance = readFileSync(new URL('../../../apps/web/src/lib/billing/aiCreditSettlementPostgres.acceptance.test.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('./run-ai-credit-settlement-postgres-dev-acceptance.mjs', import.meta.url), 'utf8');
test('explicit, coupled approvals and development PostgreSQL identity preflight', () => {
  assert.match(runner, /AI_SETTLEMENT_ACCEPTANCE_RUN/);
  assert.match(runner, /V12J8A_VERIFIED_DEVELOPMENT_DATABASE/);
  assert.match(runner, /preflightBillingDevelopmentDatabase\(selectedDevDatabaseUrl\(\)\)/);
  assert.match(acceptance, /server_started_at !== preflight\.serverStartedAt/);
});
test('ordinary Vitest run skips synthetic financial fixtures', () => {
  assert.match(acceptance, /describe\.runIf\(enabled\)/);
  assert.match(acceptance, /BILLING_ACCEPTANCE_RUN === "V12J5_VERIFIED_DEVELOPMENT_DATABASE"/);
});
test('real PostgreSQL client and canonical financial primitives are used', () => {
  assert.match(acceptance, /getPrismaClient/);
  for (const key of ['grantAiCreditLot','reserveAiCredits','settleAiCredits','settleAiCreditsFromRecordedProviderReceipt','recordAiCreditPricedProviderReceipt','freezeAiCreditWalletForVerifiedStripeRisk']) {
    assert.ok(acceptance.includes(key), key);
  }
});
test('no Stripe API or AI provider HTTP calls; no deletion, truncation or migration commands', () => {
  assert.doesNotMatch(acceptance + runner, /\bfetch\s*\(|https:\/\/api\.stripe\.com|api\.openai\.com/);
  assert.doesNotMatch(acceptance + runner, /\b(?:deleteMany|delete|truncate|executeRawUnsafe|\$executeRaw|reset|db\s+push|migrate\s+deploy)\s*\(/);
});
test('retains append-only synthetic ledger and validates per-lot conservation', () => {
  assert.match(acceptance, /pg-ai-v12j8a-/);
  assert.match(acceptance, /retained=YES/);
  assert.match(acceptance, /lot\.availableUnits \+ lot\.reservedUnits \+ lot\.consumedUnits/);
});
test('the uncertain-response branch remains reserved; pricing overrun is rejected', () => {
  assert.match(acceptance, /TRUSTED_PROVIDER_RECEIPT_MISSING/);
  assert.match(acceptance, /SETTLEMENT_EXCEEDS_RESERVED/);
  assert.match(acceptance, /RELEASE_NOT_VERIFIED/);
});
test('risk freeze and cumulative reversal paths are exercised without real refunds', () => {
  assert.match(acceptance, /AI_CREDIT_WALLET_RISK_FROZEN/);
  assert.match(acceptance, /reversalShortfallUnits/);
  assert.match(acceptance, /refundedAmountUsdMinor/);
});
test('suite is restricted to the synthetic test file, not repo-wide database writes', () => {
  assert.match(runner, /src\/lib\/billing\/aiCreditSettlementPostgres\.acceptance\.test\.ts/);
  assert.match(acceptance, /AI_SETTLEMENT_PG_AUDIT_PASS/);
});
