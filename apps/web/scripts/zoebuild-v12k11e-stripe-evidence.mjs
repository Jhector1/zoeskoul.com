#!/usr/bin/env node
/** V12K11E: human-driven real Stripe TEST evidence audit. GET only; Postgres READ ONLY. */
import {evaluateStripeCreditEvidence, StripeEvidenceError} from '../../../packages/db/scripts/zoebuild-v12k11e-stripe-evidence-policy.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(s => {
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(s);
  if (!match) throw new StripeEvidenceError('ARGUMENT_INVALID');
  return [match[1], match[2] ?? true];
}));
const fail = code => {throw new StripeEvidenceError(code);};
function preflight() {
  if(process.env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith('sk_live_') ||
     process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE === 'live') fail('LIVE_STRIPE_FORBIDDEN');
  if(!/^sk_test_[A-Za-z0-9_]{15,}$/.test(process.env.LEARNOIR_STRIPE_SECRET_KEY ?? '') ||
     !/^price_[A-Za-z0-9_]+$/.test(process.env.ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID??'') ||
     process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE !== 'sandbox-only' ||
     !/^whsec_[A-Za-z0-9_]{12,}$/.test(process.env.STRIPE_WEBHOOK_SECRET??'')) fail('TEST_STRIPE_CONFIG_INCOMPLETE');
  const raw = process.env.DATABASE_URL;
  let url;
  try {url = new URL(raw);} catch {fail('DB_URL_UNAVAILABLE');}
  if(!['localhost','127.0.0.1'].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !== 'learnoir_db') fail('DB_TARGET_NOT_APPROVED');
  for(const name of ['WEB_DATABASE_URL','ADMIN_DATABASE_URL']) {
    if(process.env[name] && process.env[name]!==raw) fail('DB_URL_OVERRIDE_CONFLICT');
  }
  if(process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT==='required') fail('PAID_CUSTOMER_METERING_ENABLED_STOP');
  return {priceId:process.env.ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID};
}
async function audit() {
  const sessionId=args.session;
  const stage=args.stage ?? 'funded';
  const eventId=args.event ?? null;
  if(!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId??'')) fail('EXACT_TEST_SESSION_REQUIRED');
  if(!['funded','replay','refund','dispute'].includes(stage)) fail('PHASE_INVALID');
  if(args.confirm !== 'V12K11E_READ_ONLY_TEST_AUDIT') fail('READ_ONLY_TEST_AUDIT_CONSENT_REQUIRED');
  if(!/^evt_[A-Za-z0-9_]+$/.test(eventId??'')) fail('STRIPE_CHECKOUT_EVENT_ID_REQUIRED');
  if(stage==='replay' && !/^[a-f0-9]{64}$/.test(args['expected-fingerprint']??'')) fail('REPLAY_EVIDENCE_REQUIRED');
  if(['refund','dispute'].includes(stage) && !/^evt_[A-Za-z0-9_]+$/.test(args['risk-event']??'')) fail('STRIPE_RISK_EVENT_ID_REQUIRED');
  const settings = preflight();
  const [{default:Stripe}, {getPrismaClient}] = await Promise.all([import('stripe'),import('@zoeskoul/db')]);
  const stripe = new Stripe(process.env.LEARNOIR_STRIPE_SECRET_KEY,{maxNetworkRetries:0,timeout:12000});
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const checkoutEvent = await stripe.events.retrieve(eventId);
  const checkoutObject = checkoutEvent.data?.object;
  if(checkoutEvent.livemode!==false || !['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(checkoutEvent.type) ||
     checkoutObject?.id!==sessionId) fail('STRIPE_CHECKOUT_EVENT_NOT_AUTHENTIC');
  const remoteRiskEvent = args['risk-event'] ? await stripe.events.retrieve(args['risk-event']) : null;
  if(remoteRiskEvent && (remoteRiskEvent.livemode!==false || !['refund.created','refund.updated','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'].includes(remoteRiskEvent.type))) fail('STRIPE_RISK_EVENT_NOT_AUTHENTIC');
  const items = await stripe.checkout.sessions.listLineItems(sessionId,{limit:2});
  if(session.livemode!==false || session.status!=='complete' || session.payment_status!=='paid') fail('STRIPE_SESSION_NOT_PAID_TEST');
  const intentId = typeof session.payment_intent==='string' ? session.payment_intent : session.payment_intent?.id;
  if(!/^pi_[A-Za-z0-9_]+$/.test(intentId??'')) fail('STRIPE_PAYMENT_INTENT_MISSING');
  const [price,payment] = await Promise.all([
    stripe.prices.retrieve(settings.priceId),
    stripe.paymentIntents.retrieve(intentId,{expand:['latest_charge']}),
  ]);
  const charge = typeof payment.latest_charge==='object' ? payment.latest_charge : null;
  const customerId = typeof session.customer==='string' ? session.customer : session.customer?.id;
  const db = getPrismaClient();
  try {
    const stored = await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const [identity] = await tx.$queryRaw`SELECT current_database() AS database, current_user AS role`;
      if(identity?.database!=='learnoir_db' || identity.role!=='admin') fail('DB_IDENTITY_NOT_APPROVED');
      const attemptId = session.metadata?.checkoutAttemptId;
      if(!/^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(attemptId??'')) fail('STRIPE_ATTEMPT_ID_INVALID');
      const attempt = await tx.zoeBuildAiCreditCheckoutAttempt.findUnique({where:{attemptId}});
      const mappedUser = await tx.user.findUnique({where:{stripeCustomerId:customerId},select:{id:true}});
      const sourceKey = `stripe:zoebuild:pi:${intentId}`;
      const lot = await tx.aiCreditLot.findUnique({where:{sourceKey}});
      const [entries,wallet,webhooks,riskEvents,reversalSnapshots] = await Promise.all([
        lot ? tx.aiCreditLedgerEntry.findMany({where:{lotId:lot.id}}) : [],
        mappedUser ? tx.aiCreditWallet.findUnique({where:{userId:mappedUser.id}}) : null,
        tx.stripeEvent.findMany({where:{objectId:sessionId, type:{in:['checkout.session.completed','checkout.session.async_payment_succeeded']}}}),
        lot ? tx.aiCreditPaymentRiskEvent.findMany({where:{lotId:lot.id}}) : [],
        lot ? tx.aiCreditPaymentReversalSnapshot.findMany({where:{lotId:lot.id}}) : [],
      ]);
      const riskWebhook = remoteRiskEvent ? await tx.stripeEvent.findUnique({where:{id:remoteRiskEvent.id}}) : null;
      return {attempt,mappedUserId:mappedUser?.id??null,lot,entries,wallet,webhooks,riskEvents,reversalSnapshots,riskWebhook};
    },{maxWait:5000,timeout:15000});
    if(remoteRiskEvent) {
      const riskObjectId = remoteRiskEvent.data?.object?.id;
      const candidate = stored.riskEvents.find(x=>x.eventKey===`stripe:zoebuild:risk:${remoteRiskEvent.id}` && x.providerObjectId===riskObjectId);
      if(!candidate || stored.riskWebhook?.status!=='processed' || stored.riskWebhook?.livemode!==false ||
         stored.riskWebhook.objectId!==riskObjectId || stored.riskWebhook.type!==remoteRiskEvent.type ||
         (stage==='refund' && candidate.kind!=='refund') ||
         (stage==='dispute' && candidate.kind!=='dispute')) fail('STRIPE_RISK_EVENT_NOT_RECONCILED');
    }
    const result=evaluateStripeCreditEvidence({session,items,price,payment,charge,...stored},
      {stage,eventId,expectedFingerprint:args['expected-fingerprint']??null});
    console.log('V12K11E_REAL_TEST_EVIDENCE_PASS');
    console.log('STAGE='+stage);
    console.log('GRANT_ENTRIES='+result.grantEntries);
    console.log('PROCESSED_CHECKOUT_WEBHOOKS='+result.webhookEvidenceCount);
    console.log('REFUNDED_USD_MINOR='+result.refundedMinor);
    console.log('REVERSED_LEDGER_UNITS='+result.reversedUnits);
    console.log('REVERSAL_SHORTFALL_UNITS='+result.reversalShortfallUnits);
    console.log('FINANCIAL_FINGERPRINT='+result.fingerprint);
    console.log('STRIPE_API=READ_ONLY_POSTGRES=READ_ONLY_CUSTOMER_CHARGES=0');
  } finally {await db.$disconnect();}
}
try {
  if(args.preflight===true && Object.keys(args).length===1) {
    preflight();
    console.log('V12K11E_ZERO_SPEND_PREFLIGHT_PASS');
    console.log('PROVIDER_CALLS=0 DATABASE_QUERIES=0 DATABASE_WRITES=0');
  } else if(args.audit===true) await audit();
  else fail('USAGE_PRELIGHT_OR_AUDIT_REQUIRED');
} catch (error) {
  const code=error instanceof StripeEvidenceError ? error.message : 'STRIPE_OR_DATABASE_READ_FAILED';
  console.error('V12K11E_REFUSED reason='+code+' NO_CREDENTIALS_PRINTED=YES');
  process.exitCode=1;
}
