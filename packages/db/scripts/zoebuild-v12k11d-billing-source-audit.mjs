#!/usr/bin/env node
/** V12K11D: source-only release-gate inventory. It is NOT operator approval. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const repo=resolve(process.argv[2] ?? ".");
function source(relative){return readFileSync(resolve(repo,relative),"utf8");}
function required(name, checks){
 const ok=checks.every(([file,needle])=>source(file).includes(needle));
 console.log(`${name}=${ok?"SOURCE_GUARDS_PRESENT":"SOURCE_GUARD_MISSING"}`);
 if(!ok)process.exitCode=1;
}
const funding="apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.ts";
const fundingServer="apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.server.ts";
const risk="apps/web/src/lib/billing/zoeBuildAiCreditStripeRisk.ts";
const ledger="packages/platform-server/src/ai-credits/aiCreditLedger.ts";
const webhook="apps/web/src/app/api/stripe/webhook/route.ts";
const operations="apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts";
const reviewed="apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts";
const release="apps/web/src/lib/billing/zoeBuildAiCreditLiveReleasePolicy.ts";
console.log("=== V12K11D SOURCE-ONLY BILLING AUDIT ===");
required("SIGNED_WEBHOOK",[[webhook,"constructEvent("],[webhook,"checkPlatformStripeEventEnvironment("]]);
required("PAYMENT_PROOF",[[funding,"retrievePaymentIntent"],[funding,"AI_CREDIT_PAYMENT_NOT_CLEAR"],
 [funding,"findCheckoutAttempt"],[funding,"stripe:zoebuild:pi:"]]);
required("REFUND_AND_DISPUTE",[[risk,"retrieveRefund"],[risk,"retrieveDispute"],
 [risk,"retrieveCharge"],[ledger,"reversalShortfallUnits"],[ledger,"riskFrozenAt"]]);
required("CANONICAL_FUNDING",[[fundingServer,"grantAiCreditLot"],[fundingServer,'origin: "verified-stripe-payment"']]);
required("RELEASE_GATES",[[operations,"ZOEBUILD_APPROVED_BILLING_OPERATIONS"],
 [reviewed,"ZOEBUILD_VERIFIED_AI_BILLING_PROFILES"],
 [release,"ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS"]]);
const live=source(funding).match(/APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS[^;]*=\s*Object\.freeze\(\[\]\)/s);
const ops=source(operations).match(/ZOEBUILD_APPROVED_BILLING_OPERATIONS[^;]*=\s*Object\.freeze\(\[\]\)/s);
const releases=source(release).match(/ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS[^;]*=\s*Object\.freeze\(\[\]\)/s);
console.log(`LIVE_PACK_REGISTRY=${live?"EMPTY_BLOCKED":"REVIEW_SOURCE_REQUIRED"}`);
console.log(`OPERATIONS_REGISTRY=${ops?"EMPTY_BLOCKED":"REVIEW_SOURCE_REQUIRED"}`);
console.log(`LIVE_RELEASE_REGISTRY=${releases?"EMPTY_BLOCKED":"REVIEW_SOURCE_REQUIRED"}`);
console.log("NO_DB_NO_STRIPE_NO_PROVIDER_NO_SECRETS_PRINTED");
console.log("NO_APPROVALS_GRANTED_NO_CUSTOMER_METERING_ENABLED");
if(!process.exitCode)console.log("V12K11D_STATIC_SOURCE_AUDIT_PASS");
