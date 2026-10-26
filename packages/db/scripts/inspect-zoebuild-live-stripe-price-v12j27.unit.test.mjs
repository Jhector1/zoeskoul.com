import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkLivePrice,inspectStripeLiveCreditPrice} from './inspect-zoebuild-live-stripe-price-v12j27.mjs';
const mod=fileURLToPath(new URL('./inspect-zoebuild-live-stripe-price-v12j27.mjs',import.meta.url));
const key=["sk", "live", "synthetic_unit_test_only"].join("_");;
const id='price_verified_live_v12j27';
const product={object:'product',livemode:true,active:true};
const price={object:'price',id,livemode:true,active:true,currency:'usd',unit_amount:500,
  unit_amount_decimal:'500',type:'one_time',billing_scheme:'per_unit',
  recurring:null,custom_unit_amount:null,transform_quantity:null,lookup_key:'zoebuild_ai_credit_500_usd_v1',
  metadata:{zoebuildAiCreditPack:'500-v1',ledgerUnits:'500000'},product};
function ok(p=price){return async()=>({ok:true,json:async()=>p});}
test('test or absent secret is rejected before network access',async()=>{
  let calls=0;const request=async()=>{calls++;throw Error('NETWORK_SHOULD_NOT_RUN');};
  for (const k of [["sk", "test", "synthetic_unit_test_only"].join("_"),undefined,["rk", "live", "synthetic_unit_test_only"].join("_")]){
    await assert.rejects(inspectStripeLiveCreditPrice({mode:'check',priceId:id,key:k,fetcher:request}),/STRIPE_LIVE_KEY_REQUIRED/);
  }
  assert.equal(calls,0);
});
test('live Price verified with direct scoped GET and expanded product',async()=>{
  let requests=0;
  const got=await inspectStripeLiveCreditPrice({mode:'check',priceId:id,key,fetcher:async(url,opts)=>{
    requests++;assert.match(url,/^https:\/\/api\.stripe\.com\/v1\/prices\/price_verified_live_v12j27/);
    assert.match(url,/expand%5B%5D=product$/);
    assert.equal(opts.method,'GET');assert.match(opts.headers.Authorization,/^Basic /);
    assert.equal(opts.redirect,'error');return (await ok())();
  }});
  assert.equal(requests,1);assert.equal(got.creditUnits,'500000');assert.equal(got.amountUsdMinor,500);
  assert.equal(got.lookupKeyVerified,false);
});
test('LIVE Price scope mismatch refuses any financial/drifted variable',()=>{
  for (const invalid of [
    {livemode:false},{unit_amount:501},{currency:'eur'},{type:'recurring'},
    {recurring:{interval:'month'}},{billing_scheme:'tiered'},
    {active:false},{custom_unit_amount:{}},{transform_quantity:{divide_by:2}},
    {metadata:{}},{metadata:{...price.metadata,ledgerUnits:'501000'}},
    {product:{...product,livemode:false}},{product:'prod_unexpanded'},
    {product:{...product,active:false}},
  ])assert.throws(()=>checkLivePrice({...price,...invalid}),/LIVE_(PRICE|PRODUCT)_/);
});
test('discovery requires exactly one scoped live price; no ambiguous selection',async()=>{
  const fetched=[];
  const got=await inspectStripeLiveCreditPrice({mode:'discover',key,fetcher:async(url,opt)=>{
    fetched.push({url,opt});return {ok:true,json:async()=>({object:'list',has_more:false,data:[price]})};
  }});
  assert.equal(got.lookupKeyVerified,true);assert.equal(fetched.length,1);
  assert.equal(fetched[0].opt.method,'GET');assert.match(fetched[0].url,/lookup_keys%5B%5D=/);
  for(const data of [[],[price,price]])await assert.rejects(
    inspectStripeLiveCreditPrice({mode:'discover',key,fetcher:async()=>({ok:true,json:async()=>({object:'list',has_more:false,data})})}),
    /NO_LIVE_PRICE_WITH_APPROVED_LOOKUP|AMBIGUOUS_LIVE_PRICE_LOOKUP/);
});
test('discovery rejects pagination or mismatched lookup and unexpected response id',async()=>{
  const request=p=>async()=>({ok:true,json:async()=>p});
  await assert.rejects(inspectStripeLiveCreditPrice({mode:'discover',key,fetcher:request({object:'list',has_more:true,data:[price]})}),/DISCOVERY_INCOMPLETE/);
  await assert.rejects(inspectStripeLiveCreditPrice({mode:'discover',key,fetcher:request({object:'list',has_more:false,data:[{...price,lookup_key:'wrong'}]})}),/LOOKUP_MISMATCH/);
  await assert.rejects(inspectStripeLiveCreditPrice({mode:'check',key,priceId:id,fetcher:request({...price,id:'price_wrong_identity'})}),/RESPONSE_ID_MISMATCH/);
});
test('non-success HTTP, malformed args and test environments fail closed',async()=>{
  await assert.rejects(inspectStripeLiveCreditPrice({mode:'check',key,priceId:id,fetcher:async()=>({ok:false,status:401})}),/STRIPE_READ_FAILED_401/);
  await assert.rejects(inspectStripeLiveCreditPrice({mode:'check',key,priceId:'cs_test_payment',fetcher:async()=>{throw Error('NETWORK_NOT_EXPECTED');}}),/PRICE_ID_NOT_CONFIGURED/);
  const p=spawnSync(process.execPath,[mod,'--discover'],{encoding:'utf8',env:{...process.env,LEARNOIR_STRIPE_SECRET_KEY:'sk_test_not_a_live_key'}});
  assert.equal(p.status,2);assert.match(p.stderr,/STRIPE_LIVE_KEY_REQUIRED/);
  assert.doesNotMatch(p.stderr,/sk_test_not_a_live_key/);
});
test('runtime source contains no writing HTTP requests or approvals',()=>{
  const src=readFileSync(mod,'utf8');
  for(const token of ['method:\'POST\'','method:\'DELETE\'','method:\'PATCH\'','method:\'PUT\'',
    'createCheckoutSession','grantPurchasedCredits','PrismaClient','APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS =',
    'ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS =','OPENAI_API_KEY'])assert.ok(!src.includes(token),token);
  assert.match(src,/MERCHANT_FEES=UNVERIFIED/);assert.match(src,/PRODUCTION_ACTIVATION=BLOCKED/);
});
