/**
 * V12J.15B: compare existing one-time Stripe TEST payment with canonical
 * wallet/ledger, Web checkout attempt and processed signed event.
 * --inspect and --audit do not mutate DB, Stripe or wallet. All DB reads occur
 * in BEGIN READ ONLY. --replay-local is a separate explicit action that POSTs
 * a verified, ALREADY PROCESSED Stripe event to the localhost Web webhook.
 * This cannot create a new Stripe Checkout or charge. It may exercise DB logic;
 * refuse if preconditions aren't exact. Never print IDs, keys or raw payloads.
 */
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export class ReplayAuditRefusal extends Error {
  constructor(code){super(code);this.name='ReplayAuditRefusal';}
}
const fail=code=>{throw new ReplayAuditRefusal(code);};
const PRICE=/^price_[A-Za-z0-9_]{5,}$/;
const SESSION=/^cs_test_[A-Za-z0-9_]{5,}$/;
const INTENT=/^pi_[A-Za-z0-9_]{5,}$/;
const EVENT=/^evt_[A-Za-z0-9_]{5,}$/;
const TEST_URL='http://127.0.0.1:3000/api/stripe/webhook';
const MAX_ATTEMPTS=20;
const APPROVED_UNITS=500000n;

export function checkConfig(env){
  if(env.ZOEBUILD_AI_CREDIT_FUNDING_MODE!=='sandbox-only')fail('SANDBOX_MODE_REQUIRED');
  if(typeof env.LEARNOIR_STRIPE_SECRET_KEY!=='string'||!env.LEARNOIR_STRIPE_SECRET_KEY.startsWith('sk_test_')||env.LEARNOIR_STRIPE_SECRET_KEY.length<24)fail('TEST_KEY_REQUIRED');
  if(typeof env.STRIPE_WEBHOOK_SECRET!=='string'||!/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET)||env.STRIPE_WEBHOOK_SECRET.length<18)fail('TEST_WEBHOOK_SECRET_REQUIRED');
  if(!PRICE.test(env.ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID||''))fail('APPROVED_PRICE_ID_REQUIRED');
  if(typeof env.DATABASE_URL!=='string'||!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))fail('DATABASE_URL_REQUIRED');
  return {priceId:env.ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID};
}
export function checkIdentity(identity,expectedDatabase,expectedRole){
  if(!identity||identity.read_only!=='on'||identity.schema!=='public'||identity.db!==expectedDatabase||identity.db_role!==expectedRole)fail('READ_ONLY_DATABASE_IDENTITY_MISMATCH');
  return true;
}
export function exactStripePurchase({attempt,session,lineItems,payment,priceId}){
  if(!attempt||!SESSION.test(attempt.stripeSessionId||'')||attempt.priceId!==priceId||
    !attempt.customerBound||!attempt.userId||!attempt.customerId)return false;
  if(!session||session.id!==attempt.stripeSessionId||session.livemode!==false||
    session.mode!=='payment'||session.status!=='complete'||session.payment_status!=='paid'||
    session.customer!==attempt.customerId||!INTENT.test(session.payment_intent||'')||
    session.currency!=='usd'||session.amount_total!==500||session.amount_subtotal!==500||
    session.total_details?.amount_discount!==0||session.total_details?.amount_tax!==0||
    session.metadata?.checkoutAttemptId!==attempt.attemptId||
    session.metadata?.creditPackPriceId!==priceId||
    session.metadata?.zoebuildAiCreditPurchase!=='v1')return false;
  if(!lineItems||lineItems.has_more!==false||lineItems.data?.length!==1||
    lineItems.data[0].price?.id!==priceId||lineItems.data[0].quantity!==1||
    lineItems.data[0].amount_total!==500||lineItems.data[0].amount_subtotal!==500)return false;
  const charge=payment?.latest_charge;
  return Boolean(payment&&payment.id===session.payment_intent&&payment.livemode===false&&
    payment.status==='succeeded'&&payment.currency==='usd'&&payment.amount===500&&payment.amount_received===500&&
    charge&&charge.payment_intent===payment.id&&charge.paid===true&&charge.captured===true&&
    charge.refunded===false&&charge.disputed===false&&charge.currency==='usd'&&charge.amount===500&&
    charge.amount_refunded===0);
}
export function checkFundedRow({lot,entries,events,riskCount,wallet},paymentIntentId){
  const sourceKey=`stripe:zoebuild:pi:${paymentIntentId}`;
  if(!lot||lot.sourceKey!==sourceKey||lot.kind!=='purchased'||BigInt(lot.grantedUnits)!==APPROVED_UNITS||
    BigInt(lot.availableUnits)<0n||BigInt(lot.reservedUnits)<0n||BigInt(lot.consumedUnits)<0n||
    BigInt(lot.expiredUnits)<0n||BigInt(lot.reversedUnits)!==0n||
    BigInt(lot.availableUnits)+BigInt(lot.reservedUnits)+BigInt(lot.consumedUnits)+BigInt(lot.expiredUnits)!==APPROVED_UNITS||
    BigInt(riskCount)!==0n||wallet?.riskFrozenAt||
    entries?.length!==1||entries[0].eventKey!==`grant:${sourceKey}`||entries[0].kind!=='grant'||
    BigInt(entries[0].availableDelta)!==APPROVED_UNITS||
    events?.length!==1||events[0].status!=='processed'||events[0].livemode!==false||
    !['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(events[0].type)||
    !EVENT.test(events[0].id))return false;
  return true;
}
export function signedStripeHeader(raw,secret,seconds){
  if(typeof raw!=='string'||!/^whsec_[A-Za-z0-9]+$/.test(secret)||!Number.isSafeInteger(seconds))fail('SIGNATURE_INPUT_INVALID');
  const sig=crypto.createHmac('sha256',secret).update(`${seconds}.${raw}`,'utf8').digest('hex');
  return `t=${seconds},v1=${sig}`;
}

async function stripeRead(endpoint,key){
  if(!endpoint.startsWith('/v1/')||endpoint.includes('..'))fail('STRIPE_GET_PATH_INVALID');
  const response=await fetch('https://api.stripe.com'+endpoint,{
    method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(13000),
    headers:{authorization:`Bearer ${key}`},
  });
  if(!response.ok)fail('STRIPE_TEST_READ_FAILED');
  return response.json();
}
function selectedUrl(raw){
  try { const u=new URL(raw);if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.pathname||u.pathname==='/')fail('DB_URL_INVALID');return raw; }
  catch {fail('DB_URL_INVALID');}
}
async function readOnly(client,callback){
  await client.query('BEGIN READ ONLY');
  try {return await callback(client);}finally{await client.query('ROLLBACK');}
}
async function dbIdentity(client){return (await client.query(`SELECT current_database() AS db,current_user AS db_role,
    current_schema() AS schema,current_setting('transaction_read_only') AS read_only`)).rows[0];}
async function candidates(client,priceId){
  return (await client.query(`SELECT a."attemptId",a."userId",a."customerId",a."priceId",a."stripeSessionId",
    (u."stripeCustomerId"=a."customerId") AS "customerBound"
    FROM public."ZoeBuildAiCreditCheckoutAttempt" a JOIN public."User" u ON u.id=a."userId"
    WHERE a."priceId"=$1 AND a."stripeSessionId" IS NOT NULL
    ORDER BY a."createdAt" DESC LIMIT ${MAX_ATTEMPTS}`,[priceId])).rows;
}
async function fundingSnapshot(client,{attempt,paymentIntentId,sessionId}){
  const sourceKey=`stripe:zoebuild:pi:${paymentIntentId}`;
  const lot=(await client.query(`SELECT "id","userId","sourceKey","kind"::text AS kind,"grantedUnits","availableUnits",
    "reservedUnits","consumedUnits","expiredUnits","reversedUnits" FROM public."AiCreditLot" WHERE "sourceKey"=$1`,[sourceKey])).rows[0];
  if(!lot||lot.userId!==attempt.userId)return null;
  const entries=(await client.query(`SELECT "kind"::text AS kind,"eventKey","availableDelta" FROM public."AiCreditLedgerEntry"
    WHERE "lotId"=$1 AND "kind"='grant'`,[lot.id])).rows;
  const events=(await client.query(`SELECT "id","type","status","livemode","attemptCount" FROM public."StripeEvent"
    WHERE "objectId"=$1 AND "type" IN ('checkout.session.completed','checkout.session.async_payment_succeeded') AND "status"='processed'`,[sessionId])).rows;
  const wallet=(await client.query(`SELECT "riskFrozenAt" FROM public."AiCreditWallet" WHERE "userId"=$1`,[attempt.userId])).rows[0];
  const risk=(await client.query(`SELECT count(*) AS n FROM public."AiCreditPaymentRiskEvent" WHERE "lotId"=$1`,[lot.id])).rows[0];
  const funds={lot,entries,events,riskCount:risk.n,wallet};
  if(!checkFundedRow(funds,paymentIntentId))return null;
  return {funds,lotId:lot.id,eventId:events[0].id,attemptCount:events[0].attemptCount,
    // Include full lot state so replay must not change reserved/available/consumed, etc.
    balance:[lot.grantedUnits,lot.availableUnits,lot.reservedUnits,lot.consumedUnits,lot.expiredUnits,lot.reversedUnits].map(String).join(':')};
}
async function scanPurchase(client,env,priceId){
  const options=await readOnly(client,c=>candidates(c,priceId));
  if(!options.length)fail('NO_DURABLE_CHECKOUT_ATTEMPT');
  const matches=[];
  for(const attempt of options){
    if(!attempt.customerBound||!SESSION.test(attempt.stripeSessionId))continue;
    const session=await stripeRead(`/v1/checkout/sessions/${encodeURIComponent(attempt.stripeSessionId)}`,env.LEARNOIR_STRIPE_SECRET_KEY);
    if(!INTENT.test(session.payment_intent||''))continue;
    const [lines,payment]=await Promise.all([
      stripeRead(`/v1/checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=2`,env.LEARNOIR_STRIPE_SECRET_KEY),
      stripeRead(`/v1/payment_intents/${encodeURIComponent(session.payment_intent)}?expand%5B%5D=latest_charge`,env.LEARNOIR_STRIPE_SECRET_KEY),
    ]);
    if(!exactStripePurchase({attempt,session,lineItems:lines,payment,priceId}))continue;
    const row=await readOnly(client,c=>fundingSnapshot(c,{attempt,paymentIntentId:payment.id,sessionId:session.id}));
    if(row)matches.push({attempt,session,payment,row});
  }
  if(matches.length!==1)fail(matches.length?'MULTIPLE_FUNDED_PACKS_AMBIGUOUS':'VERIFIED_FUNDED_PACK_NOT_FOUND');
  return matches[0];
}
async function ensureSameState(client,match){
  const check=await readOnly(client,c=>fundingSnapshot(c,{attempt:match.attempt,paymentIntentId:match.payment.id,sessionId:match.session.id}));
  if(!check||check.balance!==match.row.balance||check.eventId!==match.row.eventId||check.attemptCount!==match.row.attemptCount)fail('REPLAY_CHANGED_FUNDED_LEDGER');
  return true;
}
export function parseArgs(argv){
  if(argv.length===1&&argv[0]==='--inspect')return {mode:'inspect'};
  if(argv.length===5&&['--audit','--replay-local'].includes(argv[0])&&argv[1]==='--database'&&argv[3]==='--role')return {mode:argv[0],db:argv[2],role:argv[4]};
  if(argv.length===6&&argv[0]==='--replay-local'&&argv[1]==='--confirm-signed-test-event-replay'&&argv[2]==='--database'&&argv[4]==='--role')return {mode:argv[0],db:argv[3],role:argv[5],confirm:true};
  fail('USAGE_INSPECT_OR_AUDIT_OR_CONFIRMED_REPLAY');
}
export async function run(argv,{env=process.env,emit=console.log}={}){
  const args=parseArgs(argv);
  const {Pool}=await import('pg');
  const raw=selectedUrl(env.DATABASE_URL);
  const pool=new Pool({connectionString:raw,max:1,connectionTimeoutMillis:7000,idleTimeoutMillis:1000,statement_timeout:15000});
  try{
    const client=await pool.connect();
    try{
      const identity=await readOnly(client,dbIdentity);
      if(args.mode==='inspect'){
        emit(`V12J15B_DB_INSPECT database=${identity.db} role=${identity.db_role} schema=${identity.schema} readOnly=${identity.read_only} stripeCalls=NO writes=NO`);
        return;
      }
      if(!/^[A-Za-z0-9_.-]{1,100}$/.test(args.db)||!/^[A-Za-z0-9_.-]{1,100}$/.test(args.role))fail('INVALID_CONFIRMED_DATABASE_IDENTITY');
      checkIdentity(identity,args.db,args.role);
      const {priceId}=checkConfig(env);
      if(args.mode==='--replay-local'&&!args.confirm)fail('EXPLICIT_REPLAY_CONFIRMATION_REQUIRED');
      const match=await scanPurchase(client,env,priceId);
      emit('V12J15B_FUNDED_PAYMENT_VERIFIED stripe=test amountUsdMinor=500 packCredits=500');
      emit('V12J15B_WALLET_PROVENANCE_VERIFIED lots=1 grants=1 units=500000 signedEvent=processed ownerMatched=YES risk=NONE');
      if(args.mode==='--audit'){
        emit('V12J15B_AUDIT_PASS database=READ_ONLY stripe=GET_ONLY replay=NO newCharge=NO');
        return;
      }
      const event=await stripeRead(`/v1/events/${encodeURIComponent(match.row.eventId)}`,env.LEARNOIR_STRIPE_SECRET_KEY);
      if(event.id!==match.row.eventId||event.livemode!==false||event.type!=='checkout.session.completed'&&event.type!=='checkout.session.async_payment_succeeded'||
        event.data?.object?.id!==match.session.id||event.data?.object?.metadata?.zoebuildAiCreditPurchase!=='v1')fail('STRIPE_REPLAY_EVENT_MISMATCH');
      // Re-verify the DB preflight immediately before sending an already-processed event.
      await ensureSameState(client,match);
      const body=JSON.stringify(event);
      const signature=signedStripeHeader(body,env.STRIPE_WEBHOOK_SECRET,Math.floor(Date.now()/1000));
      const response=await fetch(TEST_URL,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
        headers:{'stripe-signature':signature,'content-type':'application/json'},body});
      // Never echo raw upstream response body (might contain sensitive data).
      const status=response.status;
      let duplicate=false;
      try {const body=await response.json();duplicate=body?.received===true&&body?.duplicate===true&&body?.outcome==='processed';}
      catch { /* malformed response fails closed; never print body */ }
      await ensureSameState(client,match);
      if(status!==200||!duplicate)fail('LOCAL_SIGNED_REPLAY_NOT_DUPLICATE_CHECK_WEB_SIGNING_SECRET_AND_LOGS');
      emit('V12J15B_REPLAY_PASS target=localhost webhookStatus=200 lots=1 grants=1 unitsUnchanged=YES event=processed paymentNewCharge=NO');
    }finally{client.release();}
  }finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run(process.argv.slice(2)).catch(error=>{
    const code=error instanceof ReplayAuditRefusal?error.message:'AUDIT_OR_PROVIDER_UNAVAILABLE';
    console.error(`V12J15B_REFUSED reason=${code} sensitiveValues=REDACTED`);
    process.exitCode=2;
  });
}
