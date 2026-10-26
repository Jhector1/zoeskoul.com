/**
 * Read-only diagnostics for V12J.6D Builder acceptance REVIEW: no provider or DB mutation.
 * Refuses non-dedicated, non-student or non-matching Stripe customer before fetching records.
 * Never prints email, customer, subscription, price, user, or grant identifiers.
 */
import { fileURLToPath } from 'node:url';
import {
  LifecycleRefusal, validateCheckArgs, fetchStripeTestSubscription,
} from './check-stripe-lifecycle-v12j6c.mjs';

const args = ['--check', 'builder_ai', 'active'];
const toleranceMs = 2000;
const asDate = value => value instanceof Date ? value : value ? new Date(value) : null;
const validDate = value => value instanceof Date && Number.isFinite(value.getTime());
function stamp(value) { const date=asDate(value); return validDate(date)?date.toISOString():'absent'; }
function deltaSeconds(a,b) {
  const first=asDate(a), second=asDate(b);
  return validDate(first)&&validDate(second)?Math.round((first.getTime()-second.getTime())/1000):null;
}
function periodFromStripe(remote) {
  const top = Number.isFinite(remote.current_period_end) ? new Date(remote.current_period_end*1000) : null;
  const items = Array.isArray(remote.items?.data) ? remote.items.data : [];
  const ends = items.map(item=>item.current_period_end).filter(Number.isFinite);
  const item = ends.length===1 ? new Date(ends[0]*1000) : null;
  const canonical = top ?? (ends.length ? new Date(Math.min(...ends)*1000) : null);
  return {top,item,canonical,itemCount:items.length};
}
function matches(a,b) {
  const first=asDate(a),second=asDate(b);
  return validDate(first)&&validDate(second)&&Math.abs(first.getTime()-second.getTime())<=toleranceMs;
}
function grantState(grant, now) {
  if (grant.revokedAt) return 'revoked';
  const starts=asDate(grant.startsAt),ends=asDate(grant.endsAt);
  if (validDate(starts)&&starts.getTime()>now.getTime()) return 'not_started';
  if (validDate(ends)&&ends.getTime()<=now.getTime()) return 'expired';
  return 'active';
}
export function summarizeBillingDiscrepancy({user,remote,row,grants,events,now=new Date(),sharedBuilderPriceSet}) {
  const period=periodFromStripe(remote);
  const builderPrice=remote.items?.data?.[0]?.price?.id;
  const statuses=['active','trialing'];
  const dbEligible=Boolean(row && statuses.includes(row.status)&&row.billingProduct==='builder_ai'&&
    sharedBuilderPriceSet.has(row.priceId)&&validDate(asDate(row.currentPeriodEnd))&&
    asDate(row.currentPeriodEnd).getTime()>now.getTime()&&
    user?.stripeCustomerId===(typeof remote.customer==='string'?remote.customer:remote.customer?.id));
  const grantCounts={};
  const grantTypes={};
  for (const feature of ['build_ai_generate','build_ai_edit']) {
    const matchesFeature=grants.filter(g=>g.feature===feature);
    const counters={active:0,revoked:0,expired:0,not_started:0};
    for (const g of matchesFeature) {
      if(g.type==='subscription') counters[grantState(g,now)]++;
      else grantTypes[g.type]=(grantTypes[g.type]??0)+1;
    }
    grantCounts[feature]=counters;
  }
  const lastEvent=events[0]??null;
  const result={
    databaseRowPresent:Boolean(row),
    databaseStatus:row?.status??'missing',
    databaseBillingProduct:row?.billingProduct??'missing',
    sharedEnvironmentRecognizesBuilderPrice:Boolean(builderPrice&&sharedBuilderPriceSet.has(builderPrice)),
    localEligibilityByCanonicalSharedPolicy:dbEligible,
    stripeItemCount:period.itemCount,
    stripeHasTopLevelPeriod:Boolean(period.top),
    stripeTopPeriodEnd:stamp(period.top),
    stripeItemPeriodEnd:stamp(period.item),
    canonicalWriterPeriodEnd:stamp(period.canonical),
    databasePeriodEnd:stamp(row?.currentPeriodEnd),
    databaseMinusCanonicalSeconds:deltaSeconds(row?.currentPeriodEnd,period.canonical),
    databaseMinusItemSeconds:deltaSeconds(row?.currentPeriodEnd,period.item),
    databaseMatchesCanonicalWriterPeriod:matches(row?.currentPeriodEnd,period.canonical),
    databaseMatchesStripeItemPeriod:matches(row?.currentPeriodEnd,period.item),
    databaseSubscriptionUpdatedAt:stamp(row?.updatedAt),
    lastSubscriptionEventType:lastEvent?.type??'missing',
    lastSubscriptionEventStatus:lastEvent?.status??'missing',
    lastSubscriptionEventProcessedAt:stamp(lastEvent?.processedAt),
    subscriptionGrantCounts:grantCounts,
    otherGrantTypeCounts:grantTypes,
  };
  // Avoid inferring a provider failure from missing ledger rows: Web's env,
  // grant writer state and unexpected revocations must be checked separately.
  let next='CHECK_WEB_RUNTIME_BUILDER_PRICE_CATALOG_AND_GRANT_RECONCILIATION';
  if(!result.databaseMatchesCanonicalWriterPeriod) next='INVESTIGATE_STALE_PERIOD_OR_WEBHOOK_RECONCILIATION';
  else if(grantCounts.build_ai_generate.active===0 || grantCounts.build_ai_edit.active===0)
    next='INVESTIGATE_MISSING_OR_REVOKED_SUBSCRIPTION_GRANTS';
  else next='CHECK_VERIFIER_PERIOD_SELECTION';
  return {facts:result,next};
}
export async function diagnoseWithDb(client, env, {fetcher}={}) {
  // Reuse the existing explicit active-stage approval and exact test-subscription guard.
  const config=validateCheckArgs(env,args);
  await client.query('BEGIN READ ONLY');
  try {
    const identity=(await client.query(`SELECT current_database() AS db,current_user AS role,
      current_schema() AS schema,current_setting('transaction_read_only') AS read_only`)).rows[0];
    if(!identity||identity.db!==env.BILLING_LIFECYCLE_CONFIRMED_DATABASE||
      identity.role!==env.BILLING_LIFECYCLE_CONFIRMED_ROLE||identity.schema!=='public'||identity.read_only!=='on')
      throw new LifecycleRefusal('DATABASE_IDENTITY_OR_READ_ONLY_MISMATCH');
    const users=(await client.query(`SELECT "id","email","roles"::text[] AS "roles","stripeCustomerId"
      FROM public."User" WHERE lower("email")=$1 LIMIT 2`,[config.email])).rows;
    if(users.length!==1||users[0].roles?.length!==1||users[0].roles[0]!=='student')
      throw new LifecycleRefusal('DEDICATED_NONEXEMPT_STUDENT_REQUIRED');
    const user=users[0];
    if(!user.stripeCustomerId)throw new LifecycleRefusal('STRIPE_CUSTOMER_LINK_MISSING');
    const remote=await fetchStripeTestSubscription(config.subscriptionId,env.LEARNOIR_STRIPE_SECRET_KEY,fetcher);
    const stripeCustomer=typeof remote.customer==='string'?remote.customer:remote.customer?.id;
    if(stripeCustomer!==user.stripeCustomerId||remote.metadata?.userId&&remote.metadata.userId!==user.id)
      throw new LifecycleRefusal('FOREIGN_STRIPE_SUBSCRIPTION_REFUSED');
    // Canonical Prisma DateTime columns are PostgreSQL timestamp(3), not timestamptz.
    // Convert naive UTC clock values to timestamptz on SELECT, so node-postgres
    // cannot apply the client's local/DST offset to period or grant dates.
    const row=(await client.query(`SELECT "userId","stripeCustomerId","stripeSubscriptionId",
      "billingProduct","priceId","status",
      ("currentPeriodEnd" AT TIME ZONE 'UTC') AS "currentPeriodEnd",
      ("updatedAt" AT TIME ZONE 'UTC') AS "updatedAt"
      FROM public."Subscription" WHERE "stripeSubscriptionId"=$1`,[config.subscriptionId])).rows;
    if(row.length!==1||row[0].userId!==user.id||row[0].stripeCustomerId!==stripeCustomer)
      throw new LifecycleRefusal('LOCAL_SUBSCRIPTION_OWNER_MISMATCH');
    const grants=(await client.query(`SELECT "feature"::text AS "feature","type"::text AS "type",
      ("revokedAt" AT TIME ZONE 'UTC') AS "revokedAt",
      ("startsAt" AT TIME ZONE 'UTC') AS "startsAt",
      ("endsAt" AT TIME ZONE 'UTC') AS "endsAt",
      ("updatedAt" AT TIME ZONE 'UTC') AS "updatedAt" FROM public."FeatureGrant"
      WHERE "userId"=$1 AND "feature" IN ('build_ai_generate','build_ai_edit') LIMIT 201`,[user.id])).rows;
    if(grants.length>200)throw new LifecycleRefusal('TOO_MANY_GRANTS');
    const events=(await client.query(`SELECT "type","status",
      ("processedAt" AT TIME ZONE 'UTC') AS "processedAt",
      ("receivedAt" AT TIME ZONE 'UTC') AS "receivedAt"
      FROM public."StripeEvent" WHERE "subscriptionId"=$1
      ORDER BY "receivedAt" DESC,"created" DESC LIMIT 5`,[config.subscriptionId])).rows;
    const diagnostic=summarizeBillingDiscrepancy({user,remote,row:row[0],grants,events,
      sharedBuilderPriceSet:config.prices.builder_ai});
    return {identity,diagnostic};
  } finally {await client.query('ROLLBACK');}
}
function safeError(e) {return e instanceof LifecycleRefusal?e.message:'READ_ONLY_DIAGNOSTIC_UNAVAILABLE';}
async function main() {
  if(process.argv.length!==3||process.argv[2]!=='--diagnose') throw new LifecycleRefusal('USAGE_DIAGNOSE_REQUIRED');
  validateCheckArgs(process.env,args);
  const uri=process.env.ADMIN_DATABASE_URL||process.env.WEB_DATABASE_URL||process.env.DATABASE_URL;
  let url;
  try{url=new URL(uri);}catch{throw new LifecycleRefusal('DATABASE_URL_MISSING_OR_INVALID');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.pathname==='/')
    throw new LifecycleRefusal('POSTGRES_REQUIRED');
  const {Pool}=await import('pg');
  const pool=new Pool({connectionString:uri,max:1,connectionTimeoutMillis:7000,idleTimeoutMillis:1000,statement_timeout:20000});
  try{
    const client=await pool.connect();
    try{
      const {identity,diagnostic}=await diagnoseWithDb(client,process.env);
      console.log(`V12J6E_PREFLIGHT_PASS database=${identity.db} role=${identity.role} readOnly=YES`);
      for(const [key,value] of Object.entries(diagnostic.facts))console.log(`${key}=${JSON.stringify(value)}`);
      console.log(`NEXT=${diagnostic.next}`);
      console.log('V12J6E_DIAGNOSTIC_DONE stripe=GET postgres=READ_ONLY changes=NO');
    }finally{client.release();}
  }finally{await pool.end();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])
  main().catch(e=>{console.error(`V12J6E_REFUSED ${safeError(e)}`);process.exitCode=1;});
