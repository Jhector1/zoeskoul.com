import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseSnapshots,review} from './review-zoe-billing-economics-v12j24.mjs';
const root=fileURLToPath(new URL('../../..',import.meta.url));
const script=fileURLToPath(new URL('./review-zoe-billing-economics-v12j24.mjs',import.meta.url));
const source=readFileSync(new URL('../../../apps/zoebuild/src/lib/build/publishedModelPriceReviews.ts',import.meta.url),'utf8');
const snapshots=parseSnapshots(source);
const now=Date.parse('2026-10-24T18:00:00Z');
const props={pack:{amountUsdMinor:500,creditUnits:'500000',processorFeeMaximumUsdNano:'750000000',requiredMarginUsdNano:'250000000'},conversion:{versionId:'proposal-only-v1',creditUnitsPerCredit:'1000',creditValueUsdNano:'10000000',markupNumerator:'2',markupDenominator:'1'},modelCaps:{maxCombinedInputTokens:20000,maxBillableOutputTokens:4096}};
test('two exact published price matrices, NOT approvals',()=>{
 assert.deepEqual(snapshots.map(x=>x.model),['gpt-6-luna','gpt-6.1-sol']);
 assert.deepEqual(snapshots[0].rates,{input:'0.10',cached_input:'0.01',cache_write:'0.125',output:'0.50'});
 assert.deepEqual(snapshots[1].rates,{input:'2.00',cached_input:'0.10',cache_write:'2.50',output:'10.00'});
});
test('revenue, provider liability, fee and surplus calculated with integer arithmetic',()=>{
 const result=review(props,snapshots,now);
 assert.equal(result.revenueUsdNano,'5000000000');
 assert.equal(result.maximumProviderLiabilityUsdNano,'2500000000');
 assert.equal(result.surplusAfterFeeAndLiabilityUsdNano,'1750000000');
 assert.equal(result.modeledRequestCeilings.length,2);
 assert.ok(result.modeledRequestCeilings.every(x=>x.withinSinglePack));
});
test('overexposure and zero or invented processing fee cannot pass',()=>{
 assert.throws(()=>review({...props,pack:{...props.pack,amountUsdMinor:200}},snapshots,now),/INSUFFICIENT_REVIEWED_COVERAGE/);
 assert.throws(()=>review({...props,pack:{...props.pack,processorFeeMaximumUsdNano:'0'}},snapshots,now),/NONZERO_REVIEWED_FEES_AND_MARGIN_REQUIRED/);
});
test('rejects unsupported output/input tier and conversion overflow',()=>{
 assert.throws(()=>review({...props,modelCaps:{...props.modelCaps,maxCombinedInputTokens:272001}},snapshots,now),/MODEL_CAPS_OUTSIDE_STANDARD_SHORT_CONTEXT/);
 assert.throws(()=>review({...props,conversion:{...props.conversion,creditUnitsPerCredit:'99999999999999999999999'}},snapshots,now),/OUT_OF_RANGE/);
});
test('stale rates block proposals and duplicate source entries refuse',()=>{
 assert.throws(()=>review(props,snapshots,Date.parse('2026-11-05T00:00:00Z')),/PRICE_SNAPSHOT_EXPIRED/);
 assert.throws(()=>parseSnapshots(source+source),/DUPLICATE_MODEL_REVIEW/);
});
test('read-only CLI reports blocked and does not require provider or database access',()=>{
 const cli=spawnSync(process.execPath,[script,'--inspect'],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:'',DATABASE_URL:'',STRIPE_WEBHOOK_SECRET:''}});
 // This test runs within 7-day window of the checked snapshot (normally 2026-10-24).
 if(Date.now()<=Date.parse('2026-10-31T00:00:00Z')){
 assert.equal(cli.status,0,cli.stderr);assert.match(cli.stdout,/PRODUCTION_ACTIVATION=BLOCKED/);
 }else {assert.notEqual(cli.status,0);assert.match(cli.stderr,/PRICE_SNAPSHOT_EXPIRED/);}
});
test('no use of env-controlled arbitrary approvals or financial side effects',()=>{
 const s=readFileSync(script,'utf8');
 for(const t of ['getStripe','PrismaClient','fetch(','DELETE FROM','INSERT INTO','migrate deploy','OPENAI_API_KEY','process.env'])assert.ok(!s.includes(t),t);
});
