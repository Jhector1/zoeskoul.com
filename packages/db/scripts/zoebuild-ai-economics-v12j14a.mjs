/**
 * V12J.14A — OFFLINE economics review, not an operational billing profile.
 * Imports the canonical platform integer conversion and the already-reviewed
 * published rate snapshots. Does not authorize Stripe, providers, or ledger grants.
 * Run only with: node --experimental-transform-types <this file> --report
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { providerNanoUsdToCreditUnits } from '../../platform-server/src/ai-credits/creditMath.ts';
import { ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS } from '../../../apps/zoebuild/src/lib/build/publishedModelPriceReviews.ts';

const NANO=1_000_000_000n;
const MILLION=1_000_000n;
const SEVEN_DAYS=7*24*60*60*1000;
const MAX_SHORT_CONTEXT=272_000;
export const V12J14A_PROPOSED_CONVERSION=Object.freeze({
 versionId:'v12j14a-proposal-NOT-APPROVED',
 creditUnitsPerCredit:'1000',creditValueUsdNano:'10000000',
 markupNumerator:'2',markupDenominator:'1',
});
export const EXAMPLE_CASES=Object.freeze([
 Object.freeze({id:'chat',inputTokens:1200,outputTokens:500}),
 Object.freeze({id:'page-edit',inputTokens:6000,outputTokens:1500}),
 Object.freeze({id:'multi-file-plan',inputTokens:16000,outputTokens:4096}),
 Object.freeze({id:'small-dev-acceptance-ceiling',inputTokens:512,outputTokens:256}),
]);
const categories=['input','cached_input','cache_write','output'];
const onlyDecimal=value=>{
 if(typeof value!=='string'||!/^(0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value))
  throw Error('INVALID_PUBLISHED_RATE');
 const [major,fraction='']=value.split('.');
 return BigInt(major)*NANO+BigInt(fraction.padEnd(9,'0'));
};
const ceil=(num,den)=>(num+den-1n)/den;
const safeTokens=(value,label)=>{
 if(!Number.isSafeInteger(value)||value<1||value>MAX_SHORT_CONTEXT)
  throw Error('INVALID_'+label);
 return BigInt(value);
};
export function assertFreshPublishedReview(review,at=new Date()){
 if(!review||review.provider!=='openai'||!['gpt-6-luna','gpt-6.1-sol'].includes(review.model)||
  review.processingTier!=='default'||review.region!=='global'||
  !review.sourceUrl?.startsWith('https://developers.openai.com/api/docs/models/')||
  review.longContextStartsAboveInputTokens!==MAX_SHORT_CONTEXT||
  !Number.isSafeInteger(review.maximumModelOutputTokens)||review.maximumModelOutputTokens<1)
  throw Error('REVIEW_MODEL_SCOPE_UNVERIFIED');
 const delta=at.getTime()-Date.parse(review.observedAt);
 if(!Number.isFinite(delta)||delta<0||delta>SEVEN_DAYS)throw Error('PUBLISHED_REVIEW_STALE');
 if(Object.keys(review.rates??{}).length!==categories.length||
  categories.some(k=>!(k in review.rates)))throw Error('REVIEW_RATE_MATRIX_INCOMPLETE');
 for(const cat of categories)onlyDecimal(review.rates[cat]);
 return review;
}
export function quoteConservativeTextScenario({review,inputTokens,outputTokens,at=new Date(),conversion=V12J14A_PROPOSED_CONVERSION}){
 assertFreshPublishedReview(review,at);
 const inp=safeTokens(inputTokens,'INPUT');
 const out=safeTokens(outputTokens,'OUTPUT');
 if(outputTokens>review.maximumModelOutputTokens)throw Error('OUTPUT_ABOVE_MODEL_MAX');
 // The provider count includes mutually exclusive ordinary, cached-read and
 // cached-write categories. Cache-write can be costlier than ordinary input.
 // Reasoning is INCLUDED in the output-token ceiling; no tool/media fees.
 const maxInputRate=categories.slice(0,3).reduce((acc,k)=>{
  const n=onlyDecimal(review.rates[k]);return n>acc?n:acc;
 },0n);
 const maxOutputRate=onlyDecimal(review.rates.output);
 const nano=ceil(inp*maxInputRate+out*maxOutputRate,MILLION);
 const units=providerNanoUsdToCreditUnits(nano.toString(),conversion);
 return Object.freeze({
  model:review.model,inputTokens,outputTokens,
  providerCeilingUsdNano:nano.toString(),
  hypotheticalChargeLedgerUnits:units.toString(),
  hypotheticalConversionVersion:conversion.versionId,
  operationalApproval:false,canFundCustomer:false,canDispatchPaidAi:false,
 });
}
export function compileReviewReport({at=new Date()}={}){
 const reviews=ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS.filter(r=>
  r.provider==='openai'&&['gpt-6-luna','gpt-6.1-sol'].includes(r.model));
 if(reviews.length!==2||new Set(reviews.map(x=>x.model)).size!==2)
  throw Error('REVIEW_CATALOG_AMBIGUOUS');
 const models=reviews.map(review=>({
  model:review.model,rateSource:review.sourceUrl,observedAt:review.observedAt,
  ratesUsdPerMillionTokens:review.rates,
  estimates:EXAMPLE_CASES.map(c=>({scenario:c.id,...quoteConservativeTextScenario({...c,review,at})})),
 }));
 return {
  audit:'V12J14A_OFFLINE_ECONOMICS_ONLY',generatedAt:at.toISOString(),
  proposal:V12J14A_PROPOSED_CONVERSION,
  unitInterpretation:'1 hypothetical credit = $0.01 nominal; 1 credit = 1000 ledger units; 2x illustrative cost multiplier',
  sourceRules:'provider global Standard text tokens only, input ceiling uses max(input,cached-input,cache-write), output includes reasoning',
  financialAuthority:'NONE',registeredPaidProfiles:false,registeredOperationalApprovals:false,
  realCustomerFunding:false,paidProviderDispatch:false,models,
 };
}
// This report is intentionally a reviewed offline tool, NOT callable by the
// ZoeBuild production route. It never loads .env, API keys or account data.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--report'){
  console.error('USAGE node --experimental-transform-types packages/db/scripts/zoebuild-ai-economics-v12j14a.mjs --report');
  process.exitCode=2;
 }else{
  try{console.log(JSON.stringify(compileReviewReport(),null,2));}
  catch(err){console.error('V12J14A_REVIEW_REFUSED '+err.message);process.exitCode=1;}
 }
}
