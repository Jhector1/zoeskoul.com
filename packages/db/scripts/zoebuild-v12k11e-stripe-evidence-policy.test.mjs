import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStripeCreditEvidence as evaluate} from './zoebuild-v12k11e-stripe-evidence-policy.mjs';
const evt='evt_example_123';
const stage='funded';
function sample() {
  return {
    session:{id:'cs_test_example',livemode:false,mode:'payment',status:'complete',payment_status:'paid',currency:'usd',amount_subtotal:500,amount_total:500,total_details:{amount_discount:0,amount_tax:0},metadata:{zoebuildAiCreditPurchase:'v1',checkoutAttemptId:'zb-ai-123e4567-e89b-12d3-a456-426614174000',creditPackPriceId:'price_test_sample'},customer:'cus_test_sample',payment_intent:'pi_test_sample'},
    items:{has_more:false,data:[{quantity:1,price:{id:'price_test_sample'},amount_subtotal:500,amount_total:500}]},
    price:{id:'price_test_sample',livemode:false,active:true,currency:'usd',unit_amount:500,type:'one_time',billing_scheme:'per_unit',recurring:null,custom_unit_amount:null},
    payment:{id:'pi_test_sample',livemode:false,status:'succeeded',amount:500,amount_received:500,currency:'usd'},
    charge:{id:'ch_test_sample',livemode:false,paid:true,captured:true,amount:500,amount_refunded:0,disputed:false,currency:'usd',payment_intent:'pi_test_sample'},
    attempt:{attemptId:'zb-ai-123e4567-e89b-12d3-a456-426614174000',userId:'test_user',priceId:'price_test_sample',customerId:'cus_test_sample',stripeSessionId:'cs_test_example'},
    mappedUserId:'test_user',
    lot:{id:'lot_test',userId:'test_user',sourceKey:'stripe:zoebuild:pi:pi_test_sample',kind:'purchased',grantedUnits:500000n,availableUnits:500000n,reservedUnits:0n,consumedUnits:0n,expiredUnits:0n,reversedUnits:0n,reversalTargetUnits:0n,reversalShortfallUnits:0n},
    entries:[{eventKey:'grant:stripe:zoebuild:pi:pi_test_sample',kind:'grant',userId:'test_user',lotId:'lot_test',availableDelta:500000n,reservedDelta:0n,consumedDelta:0n,expiredDelta:0n,reversedDelta:0n}],
    wallet:{riskFrozenAt:null},
    webhooks:[{id:evt,type:'checkout.session.completed',objectId:'cs_test_example',status:'processed',livemode:false}],
    riskEvents:[],reversalSnapshots:[],
  };
}
const fails=(s, code, opts={})=>assert.throws(()=>evaluate(s,opts),new RegExp(code));
test('exact actual Stripe test payment, durable claim and one grant PASS',()=>{
  const x=evaluate(sample());assert.equal(x.grantEntries,1);assert.match(x.fingerprint,/^[a-f0-9]{64}$/);
});
test('rejects fake paid metadata, wrong test price, or live mode',()=>{
  let s=sample();s.session.payment_status='unpaid';fails(s,'CHECKOUT_NOT_EXACT_PAID_TEST_PACK');
  s=sample();s.price.livemode=true;fails(s,'STRIPE_PRICE_OR_ITEMS_INVALID');
  s=sample();s.session.livemode=true;fails(s,'CHECKOUT_NOT_EXACT_PAID_TEST_PACK');
});
test('rejects durable checkout mismatch and foreign payment charge',()=>{
  let s=sample();s.attempt.userId='different';fails(s,'CHECKOUT_DB_PROVENANCE_MISMATCH');
  s=sample();s.charge.payment_intent='pi_foreign';fails(s,'PAYMENT_INTENT_OR_CHARGE_INVALID');
});
test('rejects double funding and broken ledger conservation',()=>{
  let s=sample();s.entries.push({...s.entries[0],eventKey:'grant_again'});fails(s,'GRANT_LEDGER_INVALID');
  s=sample();s.lot.availableUnits=499999n;fails(s,'LOT_LEDGER_CONSERVATION_FAILED');
});
test('requires successful signed webhook evidence',()=>{
  const s=sample();s.webhooks[0].status='failed';fails(s,'SIGNED_WEBHOOK_NOT_PROCESSED');
});
test('replay requires same financial digest and processed original event',()=>{
  const s=sample();const before=evaluate(s).fingerprint;
  assert.equal(evaluate(s,{stage:'replay',expectedFingerprint:before,eventId:evt}).fingerprint,before);
  fails(s,'REPLAY_FINANCIAL_STATE_CHANGED',{stage:'replay',expectedFingerprint:'0'.repeat(64),eventId:evt});
  fails(s,'REPLAY_ORIGINAL_EVENT_ID_REQUIRED',{stage:'replay',expectedFingerprint:before});
});
test('cumulative partial refund requires provider risk, exact reversal and frozen wallet',()=>{
  const s=sample();s.charge.amount_refunded=200;s.lot.availableUnits=300000n;s.lot.reversedUnits=200000n;s.lot.reversalTargetUnits=200000n;
  s.entries.push({eventKey:'reverse:refund:test:200',kind:'reverse',userId:'test_user',lotId:'lot_test',availableDelta:-200000n,reservedDelta:0n,consumedDelta:0n,expiredDelta:0n,reversedDelta:200000n});
  s.wallet.riskFrozenAt=new Date();s.riskEvents.push({eventKey:'stripe:zoebuild:risk:evt_refund',kind:'refund',paymentIntentId:'pi_test_sample',refundedAmountUsdMinor:200n});
  s.reversalSnapshots.push({refundedAmountUsdMinor:200n,chargedAmountUsdMinor:500n,targetUnits:200000n,appliedUnits:200000n,shortfallUnits:0n});
  assert.equal(evaluate(s,{stage:'refund'}).reversedUnits,'200000');
  s.lot.reversalTargetUnits=100000n;fails(s,'REFUND_REVERSAL_TARGET_MISMATCH',{stage:'refund'});
});
test('cannot mistake an unreconciled dispute for acceptance',()=>{
  const s=sample();s.charge.disputed=true;fails(s,'STRIPE_DISPUTE_NOT_RECONCILED',{stage:'dispute'});
  s.wallet.riskFrozenAt=new Date();s.riskEvents.push({eventKey:'stripe:zoebuild:risk:evt_dispute',kind:'dispute',paymentIntentId:'pi_test_sample',refundedAmountUsdMinor:0n});
  assert.equal(evaluate(s,{stage:'dispute'}).stage,'dispute');
});
