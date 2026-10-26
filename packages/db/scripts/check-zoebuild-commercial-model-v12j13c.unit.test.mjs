import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const get=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
const doc=get("docs/zoebuild/subscriptions-and-credits-v12j13c.md");
const plan=get("apps/zoebuild/src/app/[locale]/billing/BuilderBillingClient.tsx");
const credits=get("apps/zoebuild/src/app/[locale]/billing/AiCreditsPanel.tsx");
const mapping=get("apps/web/src/lib/billing/buildAiSubscriptionPolicy.ts");
const grants=get("apps/web/src/lib/billing/reconcileBuilderAiSubscriptionGrants.ts");
const route=get("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/edit/route.ts");
const model=get("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const approval=get("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");
const ledger=get("packages/platform-server/src/ai-credits/aiCreditLedger.ts");

test("current subscription product explicitly grants two distinct AI permissions",()=>{
  assert.match(mapping,/FeatureKey\.build_ai_generate/);
  assert.match(mapping,/FeatureKey\.build_ai_edit/);
  assert.match(grants,/type: "subscription"/);
  assert.ok(doc.includes("This is **not** yet the target credits-only basic AI rule"));
});
test("billing UI never presents draft Pro benefits as implemented",()=>{
  assert.match(plan,/currently configured Builder AI subscription grants generation and source-editing access/);
  assert.match(plan,/does not currently promise included AI units/);
  assert.match(plan,/after they are implemented and enforced/);
});
test("AI balance panel explains subscription versus usage without inventing payment access",()=>{
  assert.match(credits,/Subscription vs\. AI credits/);
  assert.match(credits,/Credits = metered AI usage/);
  assert.match(credits,/does not itself promise spendable AI units/);
});
test("real server edit entitlement remains checked; no bypass added",()=>{
  assert.match(route,/resolveBuildAccess\(access\)\.canEditWithAi/);
  assert.match(doc,/Do not bypass either live check/);
});
test("provider spending remains fail-closed pending reviewed pricing and approvals",()=>{
  assert.match(model,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*= Object\.freeze\(\[\]\)/);
  assert.match(approval,/Object\.freeze\(\[\]\)/);
  assert.match(doc,/No provider call and no production activation/);
});
test("credit ledger remains distinct from verified subscription-owned grants",()=>{
  assert.match(ledger,/origin: "verified-subscription-period" \| "verified-stripe-payment"/);
  assert.match(ledger,/reserveAiCredits/);
  assert.match(doc,/wallet balance, client input, or HTTP redirect/);
});
test("pricing, subscription and credit refund/cancellation rules are explicit",()=>{
  for(const value of ["expired/replayed", "refunds/chargebacks", "signed webhook", "period end", "AI-unit allowance"])
    assert.ok(doc.includes(value),value);
});
test("test checkout is expressly human-authorized and does not initiate payments from code",()=>{
  assert.match(doc,/Continue to Stripe test Checkout/);
  assert.match(doc,/mode: test/);
  assert.match(doc,/Success URL alone|success URL alone/i);
  assert.doesNotMatch(plan,/stripe\.checkout\.sessions\.create/);
});
