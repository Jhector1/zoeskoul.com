#!/usr/bin/env node
/**
 * V12J.27 - READ-ONLY actual Stripe LIVE credit Price verifier.
 * No customer listing, GET only, no Stripe creation/updates, no DB, no approvals.
 * A passed price inspection does NOT verify merchant fees, sign-offs, or release.
 */
import {Buffer} from 'node:buffer';

const STRIPE_PRICE_ID=/^price_[A-Za-z0-9_]{6,}$/;
const LOOKUP_KEY='zoebuild_ai_credit_500_usd_v1';
const META_PACK='500-v1';
const META_UNITS='500000';
const STRIPE_ROOT='https://api.stripe.com/v1/';

export function checkLivePrice(price, {requireLookup=false}={}) {
  if (!price || typeof price !== 'object' || Array.isArray(price) ||
      price.object!=='price' || !STRIPE_PRICE_ID.test(price.id??'') ||
      price.livemode!==true || price.active!==true ||
      price.currency!=='usd' || price.unit_amount!==500 ||
      price.type!=='one_time' || price.billing_scheme!=='per_unit' ||
      price.recurring!=null || price.custom_unit_amount!=null ||
      price.transform_quantity!=null ||
      (price.unit_amount_decimal!=null && price.unit_amount_decimal!=='500'))
    throw Error('LIVE_PRICE_SCOPE_MISMATCH');
  if (requireLookup && price.lookup_key!==LOOKUP_KEY) throw Error('LIVE_PRICE_LOOKUP_MISMATCH');
  if (price.metadata?.zoebuildAiCreditPack!==META_PACK ||
      price.metadata?.ledgerUnits!==META_UNITS)
    throw Error('LIVE_PRICE_METADATA_MISMATCH');
  if (!price.product || typeof price.product!=='object' ||
      price.product.object!=='product' || price.product.active!==true ||
      price.product.livemode!==true)
    throw Error('LIVE_PRODUCT_NOT_VERIFIED');
  return {priceId:price.id,currency:'usd',amountUsdMinor:500,customerCredits:500,
    creditUnits:META_UNITS,livemode:true,active:true,lookupKeyVerified:requireLookup};
}

function authorization(key) {
  if (typeof key!=='string' || !key.startsWith('sk_live_') || key.length<24)
    throw Error('STRIPE_LIVE_KEY_REQUIRED');
  return 'Basic '+Buffer.from(key+':').toString('base64');
}

async function getJson(resource,key,fetcher) {
  const url=STRIPE_ROOT+resource;
  const response=await fetcher(url,{method:'GET',headers:{Authorization:authorization(key)},
    redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response || !response.ok) throw Error('STRIPE_READ_FAILED_'+(response?.status??'UNKNOWN'));
  const data=await response.json();
  if (!data || typeof data!=='object') throw Error('STRIPE_RESPONSE_INVALID');
  return data;
}

export async function inspectStripeLiveCreditPrice({mode,priceId,key,fetcher=fetch}) {
  authorization(key); // Refuse TEST mode before ANY request.
  if (mode==='check') {
    if (!STRIPE_PRICE_ID.test(priceId??'')) throw Error('LIVE_PRICE_ID_NOT_CONFIGURED');
    const p=await getJson('prices/'+encodeURIComponent(priceId)+'?expand%5B%5D=product',key,fetcher);
    if (p.id!==priceId) throw Error('STRIPE_PRICE_RESPONSE_ID_MISMATCH');
    return checkLivePrice(p);
  }
  if (mode==='discover') {
    const result=await getJson('prices?'+new URLSearchParams({
      'lookup_keys[]':LOOKUP_KEY,limit:'10','expand[]':'data.product',
    }).toString(),key,fetcher);
    if (result.object!=='list' || result.has_more!==false || !Array.isArray(result.data))
      throw Error('LIVE_PRICE_DISCOVERY_INCOMPLETE');
    // Never choose among several; review and retire ambiguous Prices independently.
    if (result.data.length!==1) throw Error(result.data.length===0
      ? 'NO_LIVE_PRICE_WITH_APPROVED_LOOKUP' : 'AMBIGUOUS_LIVE_PRICE_LOOKUP');
    return checkLivePrice(result.data[0],{requireLookup:true});
  }
  throw Error('USAGE_CHECK_OR_DISCOVER');
}

async function main() {
  const args=process.argv.slice(2);
  const mode=args.length===1&&args[0]==='--discover'?'discover':
    args.length===2&&args[0]==='--check'?'check':null;
  if (!mode) throw Error('USAGE_--discover_OR_--check_PRICE_ID');
  // The dedicated LIVE key is intentionally not inferred from a sandbox session.
  const key=process.env.LEARNOIR_STRIPE_SECRET_KEY;
  const result=await inspectStripeLiveCreditPrice({mode,priceId:args[1],key});
  console.log('V12J27_STRIPE_LIVE_PRICE_VERIFIED=YES');
  console.log('LIVE_PRICE_ID='+result.priceId);
  console.log('CURRENCY=usd USD_MINOR=500 CUSTOMER_CREDITS=500 LEDGER_UNITS=500000');
  console.log('LIVE_PRICE_LOOKUP_VERIFIED='+(result.lookupKeyVerified?'YES':'NOT_CHECKED'));
  console.log('MERCHANT_FEES=UNVERIFIED OPERATIONAL_RELEASE=NOT_APPROVED');
  console.log('PRODUCTION_ACTIVATION=BLOCKED NO_STRIPE_WRITE_NO_DB_NO_PROVIDER_NO_KEYS_PRINTED');
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).pathname===new URL(import.meta.url).pathname){
  main().catch(e=>{
    // Never print thrown Stripe bodies, keys, request headers, or raw provider errors.
    const code=e instanceof Error&&/^[A-Z][A-Z0-9_]*$/.test(e.message)?e.message:'INSPECTION_UNAVAILABLE';
    console.error('V12J27_LIVE_INSPECTION_REFUSED reason='+code+' NO_STRIPE_WRITE=YES');
    process.exitCode=2;
  });
}
