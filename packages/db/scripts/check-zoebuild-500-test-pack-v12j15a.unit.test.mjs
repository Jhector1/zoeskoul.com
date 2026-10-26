import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {approvedZoeBuildSandboxCreditPacks, validatedPackCatalog,
 reconcileZoeBuildAiCreditCheckout} from "../../../apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.ts";
const read=(p)=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
const good={mode:"sandbox-only",stripeKey:"sk_test_"+"x".repeat(40),webhookSecret:"whsec_"+"y".repeat(32),priceId:"price_500valid"};
test("$5 acceptance pack maps exactly to 500 credits and 500,000 ledger units",()=>{
 const packs=approvedZoeBuildSandboxCreditPacks(good);
 assert.deepEqual(packs,[{priceId:"price_500valid",amountUsdMinor:500,creditUnits:"500000"}]);
 assert.equal(validatedPackCatalog(packs).size,1);
});
test("default sandbox approval refuses off mode, live/weak key, missing webhook or malformed price",()=>{
 const cases=[{mode:"off"},{stripeKey:"sk_live_"+"x".repeat(40)},
  {stripeKey:"sk_test_short"},{webhookSecret:""},{webhookSecret:"whsec_short"},
  {priceId:"not_a_price"},{priceId:""}];
 for(const patch of cases) assert.deepEqual(approvedZoeBuildSandboxCreditPacks({...good,...patch}),[]);
});
test("no config mutates the immutable off catalog",()=>{
 assert.deepEqual(approvedZoeBuildSandboxCreditPacks({mode:"off"}),[]);
 const p=approvedZoeBuildSandboxCreditPacks(good);
 assert.equal(Object.isFrozen(p),true);
 assert.deepEqual(approvedZoeBuildSandboxCreditPacks({mode:"off"}),[]);
});
test("one actual signed-webhook shaped $5 paid TEST receipt grants exactly 500000 units",async()=>{
 const attemptId="zb-ai-123e4567-e89b-12d3-a456-426614174000";
 const receipt={id:"cs_test_500receipt",livemode:false,status:"complete",mode:"payment",payment_status:"paid",
  customer:"cus_owner",payment_intent:"pi_paid500",currency:"usd",amount_total:500,amount_subtotal:500,
  total_details:{amount_discount:0,amount_tax:0},metadata:{zoebuildAiCreditPurchase:"v1",checkoutAttemptId:attemptId,creditPackPriceId:good.priceId}};
 const payment={id:"pi_paid500",livemode:false,status:"succeeded",currency:"usd",amount:500,amount_received:500,
  latestCharge:{paymentIntentId:"pi_paid500",paid:true,captured:true,refunded:false,disputed:false,
  amount_refunded:0,amount:500,currency:"usd"}};
 let grants=0;
 const deps={retrieveSession:async()=>receipt,listLineItems:async()=>({has_more:false,
  data:[{quantity:1,priceId:good.priceId,amount_total:500,amount_subtotal:500}]}),
  retrievePaymentIntent:async()=>payment,findUserIdByCustomerId:async()=>"u_owner",
  findCheckoutAttempt:async()=>({attemptId,userId:"u_owner",priceId:good.priceId,
   customerId:"cus_owner",stripeSessionId:receipt.id}),
  grantPurchasedCredits:async({userId,sourceKey,units})=>{
   assert.equal(userId,"u_owner");assert.equal(sourceKey,"stripe:zoebuild:pi:pi_paid500");
   assert.equal(units,"500000");grants++;return {created:grants===1};}};
 const event={type:"checkout.session.completed",livemode:false,data:{object:receipt}};
 const input={event,deps,approvedPacks:approvedZoeBuildSandboxCreditPacks(good),mode:"sandbox-only"};
 assert.deepEqual(await reconcileZoeBuildAiCreditCheckout(input),{kind:"funded",created:true});
 assert.deepEqual(await reconcileZoeBuildAiCreditCheckout(input),{kind:"funded",created:false});
 assert.equal(grants,2); // provider calls may repeat; ledger's sourceKey performs deduplication
});
test("production routes remain unchanged and Web is single customer-wallet authority",()=>{
 const fund=read("apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.server.ts");
 const checkout=read("apps/web/src/lib/billing/zoeBuildAiCreditStripeCheckout.server.ts");
 const route=read("apps/web/src/app/api/billing/zoebuild-ai-credits/route.ts");
 assert.match(fund,/approvedZoeBuildCreditPacks\(mode\)/);
 assert.match(checkout,/approvedZoeBuildSandboxCreditPacks\(\)/);
 assert.match(route,/verifiedZoeBuildAiSandboxCatalog/);
 assert.match(route,/readBuildHandoffSession\(body.sessionHash\)/);
 assert.doesNotMatch(route,/grantAiCreditLot|stripe\.checkout\.sessions\.create/);
});
test("browser advertises honest AI credits and never directly funds wallet",()=>{
 const ui=read("apps/zoebuild/src/app/[locale]/billing/AiCreditPacksPanel.tsx");
 assert.match(ui,/AI credits/);assert.match(ui,/1000n/);
 assert.doesNotMatch(ui,/grantAiCreditLot|process\.env\.NODE_ENV/);
});
test("optional Stripe setup is test-key-only and refuses implicit writes",()=>{
 const s=read("packages/db/scripts/zoebuild-500-test-price-v12j15a.mjs");
 assert.match(s,/sk_test_/);assert.match(s,/--confirm-test-write/);
 assert.match(s,/--check/);assert.doesNotMatch(s,/sk_live_/);
 assert.doesNotMatch(s,/DATABASE_URL|prisma|writeFileSync|\.env\.local\s*=/);
});
