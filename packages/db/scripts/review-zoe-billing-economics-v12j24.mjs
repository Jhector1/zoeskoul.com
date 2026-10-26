#!/usr/bin/env node
/**
 * V12J.24 -- operator-facing read-only economics and scope review.
 * No Stripe, PostgreSQL, API request, migration, mutation or approval side effects.
 * PUBLISHED SOURCE REVIEW IS NOT A PRICE/OPS/CUSTOMER-CHARGING SIGN-OFF.
 */
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const SOURCE=resolve(ROOT,'apps/zoebuild/src/lib/build/publishedModelPriceReviews.ts');
const MAX_INT64=(1n<<63n)-1n;
const RATE_RE=/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,9})?$/;
const INT_RE=/^[1-9][0-9]*$/;
const NONNEG=/^(?:0|[1-9][0-9]*)$/;
const PER_MILLION=1000000n;
const NANODOLLARS_PER_CENT=10000000n;
function die(code){throw Error(code);}
function bigint(s,name,zero=false){
 if(typeof s!=='string'||!(zero?NONNEG:INT_RE).test(s))die('INVALID_'+name);
 const n=BigInt(s);if(n>MAX_INT64)die('OUT_OF_RANGE_'+name);return n;
}
function rate(s){
 if(typeof s!=='string'||!RATE_RE.test(s))die('INVALID_RATE');
 const [whole,frac='']=s.split('.');return BigInt(whole)*1000000000n+BigInt(frac.padEnd(9,'0'));
}
function up(a,b){return (a+b-1n)/b;}
function parseSnapshots(source){
 const map=new Map();
 const re=/model:\s*"(gpt-6-luna|gpt-6\.1-sol)"\s*,\s*sourceUrl:\s*"([^"]+)"\s*,\s*observedAt:\s*"([^"]+)"\s*,\s*processingTier:\s*"([^"]+)"\s*,\s*region:\s*"([^"]+)"\s*,\s*longContextStartsAboveInputTokens:\s*([0-9_,]+)\s*,\s*maximumModelOutputTokens:\s*([0-9_,]+)\s*,\s*rates:\s*Object\.freeze\(\{([^}]+)\}\)/g;
 for(const m of source.matchAll(re)){
  const model=m[1];if(map.has(model))die('DUPLICATE_MODEL_REVIEW');
  if(m[2]!==`https://developers.openai.com/api/docs/models/${model}`||m[4]!=='default'||m[5]!=='global')die('REVIEW_SCOPE_UNSUPPORTED');
  const observed=Date.parse(m[3]);if(!Number.isFinite(observed))die('INVALID_REVIEW_DATE');
  const threshold=Number(m[6].replaceAll('_','')),limit=Number(m[7].replaceAll('_',''));
  if(threshold!==272000||limit!==128000)die('REVIEW_LIMIT_UNEXPECTED');
  const rates={};for(const [,field,value] of m[8].matchAll(/(input|cached_input|cache_write|output):\s*"([^"]+)"/g)){
   if(rates[field]!==undefined)die('DUPLICATE_PRICE_CATEGORY');rates[field]=value;rate(value);
  }
  if(Object.keys(rates).length!==4)die('INCOMPLETE_PRICE_MATRIX');
  map.set(model,{model,url:m[2],observedAt:m[3],threshold,limit,rates});
 }
 if(map.size!==2)die('EXPECTED_TWO_SOURCE_REVIEW_MODELS');
 return [...map.values()];
}
function review(proposal,models,now){
 if(!proposal||typeof proposal!=='object'||Array.isArray(proposal))die('PROPOSAL_INVALID');
 const {pack,conversion,modelCaps}=proposal;
 if(!pack||!conversion||!modelCaps)die('PROPOSAL_INCOMPLETE');
 if(typeof pack.amountUsdMinor!=='number'||!Number.isSafeInteger(pack.amountUsdMinor)||pack.amountUsdMinor<=0)die('INVALID_STRIPE_MINOR_AMOUNT');
 const units=bigint(pack.creditUnits,'CREDIT_UNITS');
 const fee=bigint(pack.processorFeeMaximumUsdNano,'FEE_ALLOWANCE',true);
 const margin=bigint(pack.requiredMarginUsdNano,'MINIMUM_MARGIN',true);
 const perCredit=bigint(conversion.creditUnitsPerCredit,'CREDIT_UNITS_PER_CREDIT');
 const value=bigint(conversion.creditValueUsdNano,'CREDIT_VALUE_NANO');
 const markupNum=bigint(conversion.markupNumerator,'MARKUP_NUMERATOR');
 const markupDen=bigint(conversion.markupDenominator,'MARKUP_DENOMINATOR');
 const input=modelCaps.maxCombinedInputTokens,output=modelCaps.maxBillableOutputTokens;
 if(!Number.isSafeInteger(input)||input<1||input>272000||!Number.isSafeInteger(output)||output<1||output>128000)die('MODEL_CAPS_OUTSIDE_STANDARD_SHORT_CONTEXT');
 if(fee===0n||margin===0n)die('NONZERO_REVIEWED_FEES_AND_MARGIN_REQUIRED');
 if(typeof conversion.versionId!=='string'||!/^[-A-Za-z0-9._:]{8,100}$/.test(conversion.versionId))die('CONVERSION_VERSION_UNREVIEWED');
 const revenue=BigInt(pack.amountUsdMinor)*NANODOLLARS_PER_CENT;
 const liability=(units*value*markupDen)/(perCredit*markupNum); // floor because settled requests round credits UP
 const surplus=revenue-fee-liability;
 if(surplus<margin)die('INSUFFICIENT_REVIEWED_COVERAGE');
 const estimates=models.map(m=>{
  const age=now-Date.parse(m.observedAt);
  if(age<0||age>7*24*60*60*1000)die('PRICE_SNAPSHOT_EXPIRED');
  const highInput=['input','cached_input','cache_write'].map(k=>rate(m.rates[k])).reduce((a,b)=>a>b?a:b);
  // Ceiling-rounded USD nanodollars; includes ALL configured input, cache-write and output tokens, but excludes tools/media.
  const maxCostNano=up(highInput*BigInt(input)+rate(m.rates.output)*BigInt(output),PER_MILLION);
  const maxChargeUnits=up(maxCostNano*markupNum*perCredit,markupDen*value);
  return {model:m.model,maximumProviderCostUsdNano:String(maxCostNano),maximumReservedUnits:String(maxChargeUnits),withinSinglePack:maxChargeUnits<=units};
 });
 return {revenueUsdNano:String(revenue),maximumProviderLiabilityUsdNano:String(liability),processorFeeMaximumUsdNano:String(fee),requiredMarginUsdNano:String(margin),surplusAfterFeeAndLiabilityUsdNano:String(surplus),modeledRequestCeilings:estimates};
}
export {parseSnapshots,review};
function main(){
 const args=process.argv.slice(2);
 if(!(args.length===1&&args[0]==='--inspect') && !(args.length===2&&args[0]==='--proposal'))die('USAGE_--inspect_OR_--proposal_JSON_PATH');
 const models=parseSnapshots(readFileSync(SOURCE,'utf8'));
 const now=Date.now();
 for(const m of models){
  const age=now-Date.parse(m.observedAt);
  console.log(`MODEL=${m.model} SOURCE=${m.url} STANDARD_GLOBAL_INPUT=${m.rates.input} CACHED_INPUT=${m.rates.cached_input} CACHE_WRITE=${m.rates.cache_write} OUTPUT=${m.rates.output} USD_PER_MTOK REVIEW_AGE_DAYS=${(age/86400000).toFixed(2)}`);
  if(age<0||age>7*86400000)die('PRICE_SNAPSHOT_EXPIRED');
 }
 if(args[0]==='--proposal'){
  const st=lstatSync(args[1]);if(st.isSymbolicLink()||!st.isFile()||st.size>32768)die('INVALID_PROPOSAL_FILE');
  const prop=JSON.parse(readFileSync(args[1],'utf8'));
  console.log('OPERATOR_PROPOSAL_ECONOMICS='+JSON.stringify(review(prop,models,now)));
  console.log('PROPOSAL_STATUS=ARITHMETIC_ONLY_NOT_LIVE_PRICE_APPROVAL');
 }
 console.log('VERIFIED_SOURCE_SNAPSHOT=YES ACCOUNT_FEES=NOT_VERIFIED OPERATIONS=NOT_APPROVED LIVE_STRIPE_PRICE=NOT_APPROVED');
 console.log('PRODUCTION_ACTIVATION=BLOCKED PUBLISHED_RATES_DO_NOT_AUTHORIZE_CHARGING');
 console.log('NO_DATABASE_NO_STRIPE_NO_PROVIDER_NO_KEYS_NO_GIT');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(error){console.error('V12J24_REVIEW_REFUSED',error instanceof Error?error.message:'UNKNOWN');process.exitCode=2;}
}
