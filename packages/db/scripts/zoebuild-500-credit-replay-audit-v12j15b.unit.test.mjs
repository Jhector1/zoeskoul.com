import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {checkConfig,checkIdentity,exactStripePurchase,checkFundedRow,signedStripeHeader,parseArgs} from './zoebuild-500-credit-replay-audit-v12j15b.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const env={ZOEBUILD_AI_CREDIT_FUNDING_MODE:'sandbox-only',LEARNOIR_STRIPE_SECRET_KEY:'sk_test_'+'A'.repeat(25),STRIPE_WEBHOOK_SECRET:'whsec_'+'B'.repeat(25),ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID:'price_123456',DATABASE_URL:'postgresql://placeholder@localhost/placeholder'};
const attempt={stripeSessionId:'cs_test_123456',priceId:'price_123456',customerBound:true,userId:'owner',customerId:'cus_owner',attemptId:'zb-ai-123e4567-e89b-12d3-a456-426614174000'};
const session={id:attempt.stripeSessionId,livemode:false,mode:'payment',status:'complete',payment_status:'paid',customer:attempt.customerId,payment_intent:'pi_123456',currency:'usd',amount_total:500,amount_subtotal:500,total_details:{amount_discount:0,amount_tax:0},metadata:{checkoutAttemptId:attempt.attemptId,creditPackPriceId:attempt.priceId,zoebuildAiCreditPurchase:'v1'}};
const lineItems={has_more:false,data:[{price:{id:attempt.priceId},quantity:1,amount_total:500,amount_subtotal:500}]};
const payment={id:'pi_123456',livemode:false,status:'succeeded',currency:'usd',amount:500,amount_received:500,latest_charge:{payment_intent:'pi_123456',paid:true,captured:true,refunded:false,disputed:false,amount:500,amount_refunded:0,currency:'usd'}};
const lot={sourceKey:'stripe:zoebuild:pi:pi_123456',kind:'purchased',grantedUnits:'500000',availableUnits:'500000',reservedUnits:'0',consumedUnits:'0',expiredUnits:'0',reversedUnits:'0'};
const entries=[{eventKey:'grant:stripe:zoebuild:pi:pi_123456',kind:'grant',availableDelta:'500000'}];
const events=[{id:'evt_123456',status:'processed',livemode:false,type:'checkout.session.completed'}];
const funded={lot,entries,events,riskCount:'0',wallet:{riskFrozenAt:null}};
test('sandbox test-only credentials and exact pack id are required',()=>{
 assert.equal(checkConfig(env).priceId,attempt.priceId);
 for(const patch of [{ZOEBUILD_AI_CREDIT_FUNDING_MODE:'off'},{LEARNOIR_STRIPE_SECRET_KEY:'sk_live_'+'Z'.repeat(30)},{STRIPE_WEBHOOK_SECRET:''},{DATABASE_URL:'mysql://bad'},{ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID:'price_BAD/' }])assert.throws(()=>checkConfig({...env,...patch}));
});
test('explicit database identity in a real read-only transaction is required',()=>{
 const identity={db:'devtest',db_role:'devuser',schema:'public',read_only:'on'};
 assert.equal(checkIdentity(identity,'devtest','devuser'),true);
 for(const i of [{read_only:'off'},{db:'prod'},{schema:'other'},{db_role:'other'}])assert.throws(()=>checkIdentity({...identity,...i},'devtest','devuser'));
});
test('only exact paid unrefunded test checkout and correct owner/price can match',()=>{
 const base={attempt,session,lineItems,payment,priceId:attempt.priceId};
 assert.equal(exactStripePurchase(base),true);
 for(const p of [{session:{...session,livemode:true}},{session:{...session,amount_total:499}},{attempt:{...attempt,customerBound:false}},
  {payment:{...payment,latest_charge:{...payment.latest_charge,refunded:true}}},{payment:{...payment,amount_received:499}},
  {lineItems:{...lineItems,has_more:true}},{session:{...session,metadata:{...session.metadata,checkoutAttemptId:'forged'}}}]){
   assert.equal(exactStripePurchase({...base,...p}),false);
 }
});
test('unique ledger grant and single already-processed signed event are mandatory',()=>{
 assert.equal(checkFundedRow(funded,payment.id),true);
 for(const p of [{events:[]},{events:[events[0],events[0]]},{events:[{...events[0],status:'failed'}]},
  {entries:[]},{entries:[entries[0],entries[0]]},{riskCount:'1'},{lot:{...lot,grantedUnits:'1000000'}},
  {lot:{...lot,availableUnits:'1000000'}},{wallet:{riskFrozenAt:new Date()}}])assert.equal(checkFundedRow({...funded,...p},payment.id),false);
});
test('local Stripe signature is deterministic and replay is not enabled by audit flag',()=>{
 const data='{"id":"evt_test","livemode":false}',key='whsec_'+'X'.repeat(25);
 const actual=signedStripeHeader(data,key,100);
 assert.equal(actual,`t=100,v1=${createHmac('sha256',key).update('100.'+data).digest('hex')}`);
 assert.equal(parseArgs(['--audit','--database','testdb','--role','testrole']).mode,'--audit');
 assert.equal(parseArgs(['--replay-local','--database','testdb','--role','testrole']).confirm,undefined);
 assert.equal(parseArgs(['--replay-local','--confirm-signed-test-event-replay','--database','testdb','--role','testrole']).confirm,true);
});
test('no new charge, fund, wallet mutation, synthetic data or AI activation route',()=>{
 const audit=read('packages/db/scripts/zoebuild-500-credit-replay-audit-v12j15b.mjs');
 const packs=read('apps/zoebuild/src/app/[locale]/billing/AiCreditPacksPanel.tsx');
 assert.match(audit,/BEGIN READ ONLY/);assert.match(audit,/ROLLBACK/);assert.match(audit,/\.status==='processed'|\.status!==\x27processed\x27/);
 assert.match(audit,/http:\/\/127\.0\.0\.1:3000\/api\/stripe\/webhook/);
 assert.doesNotMatch(audit,/grantAiCreditLot|\.checkout\.sessions\.create|\/v1\/checkout\/sessions[^\n]*method:\s*['\"]POST/);
 assert.match(packs,/Stripe TEST mode only/);
 assert.doesNotMatch(audit+packs,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES\s*=\s*\[/);
});
