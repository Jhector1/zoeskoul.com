import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS} from '../../../apps/zoebuild/src/lib/build/publishedModelPriceReviews.ts';
import {providerNanoUsdToCreditUnits} from '../../platform-server/src/ai-credits/creditMath.ts';
import {
 V12J14A_PROPOSED_CONVERSION,quoteConservativeTextScenario,compileReviewReport,assertFreshPublishedReview,
} from './zoebuild-ai-economics-v12j14a.mjs';
const today=new Date('2026-10-23T18:00:00Z');
const by=model=>ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS.find(x=>x.model===model);
const luna=by('gpt-6-luna'),sol=by('gpt-6.1-sol');
const quote=(review,inputTokens=512,outputTokens=256)=>quoteConservativeTextScenario({review,inputTokens,outputTokens,at:today});
const src=(p)=>readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../../../',p),'utf8');

test('official observed Luna and Sol text prices are distinct and fresh on Oct 23',()=>{
 assert.equal(luna.rates.input,'0.10');assert.equal(luna.rates.output,'0.50');
 assert.equal(sol.rates.input,'2.00');assert.equal(sol.rates.output,'10.00');
 assert.equal(assertFreshPublishedReview(luna,today),luna);
 assert.equal(assertFreshPublishedReview(sol,today),sol);
});
test('ceiling includes more expensive cache-write rate and all output/reasoning tokens',()=>{
 // 512 * 0.125 + 256 * 0.50 = 192 nanodollars-per-1000 tokens => 192000 nanoUSD.
 assert.equal(quote(luna).providerCeilingUsdNano,'192000');
 // Sol 512 * 2.50 + 256 * 10 = 3840 nanoUSD-per-1000 tokens => 3840000 nanoUSD.
 assert.equal(quote(sol).providerCeilingUsdNano,'3840000');
});
test('hypothetical credits use the canonical production integer converter and round UP',()=>{
 for(const model of [luna,sol]){
  const result=quote(model);
  assert.equal(result.hypotheticalChargeLedgerUnits,
    providerNanoUsdToCreditUnits(result.providerCeilingUsdNano,V12J14A_PROPOSED_CONVERSION).toString());
  assert.equal(result.operationalApproval,false);
  assert.equal(result.canDispatchPaidAi,false);
  assert.equal(result.canFundCustomer,false);
 }
 assert.equal(quote(luna).hypotheticalChargeLedgerUnits,'39');
 assert.equal(quote(sol).hypotheticalChargeLedgerUnits,'768');
});
test('rejects stale or future evidence, and unreviewed tiers/models',()=>{
 assert.throws(()=>quoteConservativeTextScenario({review:luna,inputTokens:2,outputTokens:2,
  at:new Date('2026-11-01T00:00:00Z')}),/PUBLISHED_REVIEW_STALE/);
 assert.throws(()=>assertFreshPublishedReview(luna,new Date('2026-10-18T00:00:00Z')),/PUBLISHED_REVIEW_STALE/);
 assert.throws(()=>assertFreshPublishedReview({...luna,processingTier:'fast'},today),/REVIEW_MODEL_SCOPE_UNVERIFIED/);
 assert.throws(()=>assertFreshPublishedReview({...luna,model:'unknown'},today),/REVIEW_MODEL_SCOPE_UNVERIFIED/);
});
test('rejects invalid token bounds, zero, unsafe and above short-context limits',()=>{
 for(const n of [0,-1,1.1,272001,Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>quote(luna,n,10),/INVALID_INPUT/);
 for(const n of [0,-1,1.2,272001])assert.throws(()=>quote(luna,1,n));
});
test('validates full four category price matrix with exact decimals',()=>{
 assert.throws(()=>quote({...sol,rates:{...sol.rates,output:'NaN'}}),/INVALID_PUBLISHED_RATE/);
 assert.throws(()=>quote({...sol,rates:{input:'2.00',output:'10.00'}}),/REVIEW_RATE_MATRIX_INCOMPLETE/);
 assert.throws(()=>quote({...sol,rates:{...sol.rates,cache_write:'-0.2'}}),/INVALID_PUBLISHED_RATE/);
});
test('report is strictly offline and requires distinct reviewed provider source',()=>{
 const report=compileReviewReport({at:today});
 assert.equal(report.models.length,2);
 assert.equal(report.models[0].estimates.length,4);
 assert.deepEqual(new Set(report.models.map(x=>x.model)),new Set(['gpt-6-luna','gpt-6.1-sol']));
 assert.equal(report.registeredPaidProfiles,false);
 assert.equal(report.registeredOperationalApprovals,false);
 assert.equal(report.realCustomerFunding,false);
 assert.equal(report.paidProviderDispatch,false);
});
test('compiled production profile and operational approvals remain EMPTY, independent of economics',()=>{
 const profiles=src('apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts');
 const operations=src('apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts');
 assert.match(profiles,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*= Object\.freeze\(\[\]\)/);
 assert.match(operations,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[\s\S]*?Object\.freeze\(\[\]\)/);
 const ledger=src('packages/platform-server/src/ai-credits/aiCreditLedger.ts');
 assert.match(ledger,/origin: "verified-subscription-period" \| "verified-stripe-payment"/);
 assert.match(ledger,/SOURCE_KIND_MISMATCH/);
 const live=src('apps/zoebuild/src/lib/build/serverOwnedZoeBuildMetering.ts');
 assert.match(live,/resolveProductionZoeBuildBillingProfile\(candidate/);
 assert.doesNotMatch(live,/V12J14A_PROPOSED_CONVERSION|zoebuild-ai-economics-v12j14a/);
});
