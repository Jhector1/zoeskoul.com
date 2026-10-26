import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8");
const route=read("apps/zoebuild/src/app/api/billing/credits/route.ts");
const panel=read("apps/zoebuild/src/app/[locale]/billing/AiCreditsPanel.tsx");
const shell=read("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const profiles=read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const ops=read("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");
test("readiness is sourced from canonical build access, never wallet or client assertions",()=>{
  assert.match(route,/resolveBuildAccess\(access\)/);
  assert.match(route,/canEditWithAi:decision\.canEditWithAi/);
  assert.match(route,/canGenerateWithAi:decision\.canGenerateWithAi/);
});
test("API is self-scoped and never issues or repairs grants",()=>{
  assert.match(route,/loadCurrentBuildAccessSnapshot\(request\)/);
  assert.match(route,/if\(!access\.userId\)return json\(\{error:"Unauthorized"\},401\)/);
  assert.doesNotMatch(route,/featureGrant\.(create|update|upsert)|syncSubscriptionsForUser|reconcileFeatureGrant/);
});
test("compiled production price and operational registries remain empty",()=>{
  assert.match(profiles,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*= Object\.freeze\(\[\]\)/);
  assert.match(ops,/Object\.freeze\(\[\]\)/);
  assert.match(route,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES\.length>0/);
  assert.match(route,/ZOEBUILD_APPROVED_BILLING_OPERATIONS\.length>0/);
});
test("billing panel distinguishes editing grant from credit balance",()=>{
  assert.match(panel,/Source editing grant:/);
  assert.match(panel,/Credits or an existing project do not grant editing permission/);
  assert.match(panel,/registration indicators, not approval/);
});
test("both intent and edit denials show the same actionable entitlement message",()=>{
  assert.match(shell,/const AI_EDIT_ACCESS_MESSAGE =/);
  assert.ok((shell.match(/AI_EDIT_ACCESS_MESSAGE/g)||[]).length>=3);
  assert.match(shell,/intentResult\?\.code === "BUILD_AI_EDIT_NOT_ENTITLED"/);
});
test("no new pricing approval or payment activation is introduced",()=>{
  assert.doesNotMatch(route,/stripe\.|OPENAI_API_KEY|process\.env\.NODE_ENV/);
  assert.match(route,/creditTopUpsAvailable:false/);
  assert.match(panel,/Credit spending is not yet activated/);
});
