import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileZoeBuildAiCreditCheckout} from '../../../apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.ts';
const read=(path)=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8');
const server=read('apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.server.ts');
const funding=read('apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.ts');
const attempt='zb-ai-123e4567-e89b-12d3-a456-426614174000';
const price='price_test_approved';
const metadata={zoebuildAiCreditPurchase:'v1',checkoutAttemptId:attempt,creditPackPriceId:price};
const receipt={id:'cs_test_valid',livemode:false,status:'complete',mode:'payment',
 payment_status:'paid',customer:'cus_owner',payment_intent:'pi_unique',currency:'usd',
 amount_total:1200,amount_subtotal:1200,total_details:{amount_discount:0,amount_tax:0},metadata};
const payment={id:'pi_unique',livemode:false,status:'succeeded',currency:'usd',
 amount:1200,amount_received:1200,latestCharge:{paymentIntentId:'pi_unique',paid:true,
 captured:true,refunded:false,disputed:false,amount_refunded:0,currency:'usd',amount:1200}};
function scenario(patch={}) {
 let grantCount=0;
 const proof={attemptId:attempt,userId:'owner',priceId:price,customerId:'cus_owner',stripeSessionId:receipt.id};
 const deps={retrieveSession:async()=>({...receipt,...patch.receipt}),
   listLineItems:async()=>({has_more:false,data:[{quantity:1,priceId:price,amount_subtotal:1200,amount_total:1200}]}),
   retrievePaymentIntent:async()=>payment,findUserIdByCustomerId:async()=> 'owner',
   findCheckoutAttempt:async()=>patch.proof===undefined?proof:patch.proof,
   grantPurchasedCredits:async()=>{grantCount++;return {created:true}}};
 const event={id:'evt_1',type:'checkout.session.completed',livemode:false,data:{object:receipt}};
 const input={event,deps,mode:'sandbox-only',approvedPacks:[{priceId:price,amountUsdMinor:1200,creditUnits:'1200000'}]};
 return {input,grants:()=>grantCount};
}
test('verified signed checkout + durable claim authorizes one exact funding intent',async()=>{
 const x=scenario();assert.deepEqual(await reconcileZoeBuildAiCreditCheckout(x.input),{kind:'funded',created:true});assert.equal(x.grants(),1);
});
test('missing and cross-account checkout claims never fund customer',async()=>{
 for(const proof of [null,{attemptId:attempt,userId:'victim',priceId:price,customerId:'cus_owner',stripeSessionId:receipt.id},
 {attemptId:attempt,userId:'owner',priceId:price,customerId:'cus_owner',stripeSessionId:'cs_test_other'}]) {
  const x=scenario({proof});await assert.rejects(()=>reconcileZoeBuildAiCreditCheckout(x.input),/AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH/);assert.equal(x.grants(),0);
 }
});
test('mismatched Stripe metadata never funds or bypasses durable record',async()=>{
 for(const metadata of [{zoebuildAiCreditPurchase:'v1',checkoutAttemptId:'bad',creditPackPriceId:price},
 {zoebuildAiCreditPurchase:'v1',checkoutAttemptId:attempt,creditPackPriceId:'price_wrong'}]){
  const x=scenario({receipt:{metadata}});await assert.rejects(()=>reconcileZoeBuildAiCreditCheckout(x.input),/AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH/);assert.equal(x.grants(),0);
 }
});
test('reconciliation remains off until approved sandbox catalog and mode',async()=>{
 const x=scenario();await assert.rejects(()=>reconcileZoeBuildAiCreditCheckout({...x.input,mode:'off'}),/AI_CREDIT_FUNDING_DISABLED/);assert.equal(x.grants(),0);
 const y=scenario();await assert.rejects(()=>reconcileZoeBuildAiCreditCheckout({...y.input,approvedPacks:[]}),/AI_CREDIT_PACK_CATALOG_EMPTY/);assert.equal(y.grants(),0);
});
test('server-only dependency fetches trusted checkout claim and no browser userId',()=>{
 assert.match(server,/prisma\.zoeBuildAiCreditCheckoutAttempt\.findUnique/);
 assert.match(server,/stripeSessionId: true/);
 assert.match(funding,/proof\.stripeSessionId !== session\.id/);
 assert.match(server,/grantAiCreditLot/);
 assert.match(funding,/stripe:zoebuild:pi:/);
 assert.match(funding,/AI_CREDIT_LIVE_FUNDING_BLOCKED/);
});
