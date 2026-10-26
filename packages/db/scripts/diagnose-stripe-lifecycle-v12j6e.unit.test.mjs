import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeBillingDiscrepancy,diagnoseWithDb} from './diagnose-stripe-lifecycle-v12j6e.mjs';
const now=new Date('2026-10-23T15:00:00Z');
const future=new Date('2026-11-23T20:06:44Z');
const env={
  BILLING_LIFECYCLE_APPROVAL:'V12J6C_READ_ONLY_DEDICATED_TEST_ACCOUNT',
  BILLING_LIFECYCLE_CONFIRMED_DATABASE:'learnoir_db',BILLING_LIFECYCLE_CONFIRMED_ROLE:'admin',
  BILLING_LIFECYCLE_TEST_EMAIL:'v12j6c-billing-test@example.org',
  BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID:'sub_test_synthetic',
  LEARNOIR_STRIPE_SECRET_KEY:'sk_test_synthetic_only',
  ZOEBUILD_AI_STRIPE_PRICE_IDS:'price_test_builder',
  ZOEBUILD_AI_STRIPE_PRODUCT_IDS:'prod_test_builder',
};
const user={id:'user_private',email:env.BILLING_LIFECYCLE_TEST_EMAIL,roles:['student'],stripeCustomerId:'cus_private'};
const remote={id:env.BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID,object:'subscription',livemode:false,
  customer:'cus_private',status:'active',metadata:{userId:'user_private',billingProduct:'builder_ai'},
  current_period_end:Math.floor(future.getTime()/1000),
  items:{data:[{current_period_end:Math.floor(future.getTime()/1000),price:{id:'price_test_builder',product:'prod_test_builder'}}]},
};
const row={userId:user.id,stripeSubscriptionId:remote.id,stripeCustomerId:'cus_private',priceId:'price_test_builder',
  billingProduct:'builder_ai',status:'active',currentPeriodEnd:future,updatedAt:now};
const events=[{type:'customer.subscription.created',status:'processed',processedAt:now}];
const grants=['build_ai_generate','build_ai_edit'].map(feature=>({feature,type:'subscription',startsAt:null,endsAt:future,revokedAt:null}));
const summarize=patch=>summarizeBillingDiscrepancy({user,remote,row,grants,events,now,
  sharedBuilderPriceSet:new Set(['price_test_builder']),...patch});
test('exact match has two active grants, processed event and canonical period parity',()=>{
  const result=summarize({});
  assert.equal(result.facts.databaseMatchesCanonicalWriterPeriod,true);
  assert.equal(result.facts.localEligibilityByCanonicalSharedPolicy,true);
  assert.equal(result.facts.subscriptionGrantCounts.build_ai_generate.active,1);
  assert.equal(result.facts.subscriptionGrantCounts.build_ai_edit.active,1);
  for (const privateItem of [user.id,user.email,user.stripeCustomerId,remote.id,'price_test_builder'])
    assert.equal(JSON.stringify(result).includes(privateItem),false,`private leak ${privateItem}`);
});
test('period delta identifies old DB state without exposing provider IDs',()=>{
  const result=summarize({row:{...row,currentPeriodEnd:new Date(future.getTime()-86400000)}});
  assert.equal(result.facts.databaseMinusCanonicalSeconds,-86400);
  assert.equal(result.facts.databaseMatchesCanonicalWriterPeriod,false);
  assert.equal(result.next,'INVESTIGATE_STALE_PERIOD_OR_WEBHOOK_RECONCILIATION');
});
test('top-level Stripe period and item-level period are reported separately',()=>{
  const itemEnd=new Date(future.getTime()+86400000);
  const altered={...remote,items:{data:[{...remote.items.data[0],current_period_end:Math.floor(itemEnd.getTime()/1000)}]}};
  const result=summarize({remote:altered});
  assert.equal(result.facts.databaseMatchesCanonicalWriterPeriod,true);
  assert.equal(result.facts.databaseMatchesStripeItemPeriod,false);
  assert.equal(result.facts.databaseMinusItemSeconds,-86400);
  assert.equal(result.next,'CHECK_VERIFIER_PERIOD_SELECTION');
});
test('reports zero grants, revoked and expired grants distinctly',()=>{
  const missing=summarize({grants:[]});
  assert.deepEqual(missing.facts.subscriptionGrantCounts.build_ai_generate,{active:0,revoked:0,expired:0,not_started:0});
  assert.equal(missing.next,'INVESTIGATE_MISSING_OR_REVOKED_SUBSCRIPTION_GRANTS');
  const mixed=summarize({grants:[{...grants[0],revokedAt:now},{...grants[1],endsAt:new Date('2026-10-22T00:00:00Z')}]});
  assert.equal(mixed.facts.subscriptionGrantCounts.build_ai_generate.revoked,1);
  assert.equal(mixed.facts.subscriptionGrantCounts.build_ai_edit.expired,1);
});
test('local eligible projection cannot be inferred when customer ownership differs',()=>{
  assert.equal(summarize({row:{...row,priceId:'price_wrong'}}).facts.localEligibilityByCanonicalSharedPolicy,false);
  assert.equal(summarize({user:{...user,stripeCustomerId:'cus_other'}}).facts.localEligibilityByCanonicalSharedPolicy,false);
});
function fakeDb(userRow=user){
  const calls=[];
  return {calls,async query(sql){
    calls.push(sql);
    if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(sql.includes('current_database()'))return {rows:[{db:'learnoir_db',role:'admin',schema:'public',read_only:'on'}]};
    if(sql.includes('FROM public."User"'))return {rows:[userRow]};
    if(sql.includes('FROM public."Subscription"'))return {rows:[row]};
    if(sql.includes('FROM public."FeatureGrant"'))return {rows:grants};
    if(sql.includes('FROM public."StripeEvent"'))return {rows:events};
    throw Error(`unexpected select`);
  }};
}
const provider=async (_url,init)=>{
  assert.equal(init.method,'GET');
  return {ok:true,json:async()=>remote};
};
test('diagnostic runs exactly one Stripe GET inside read-only PostgreSQL transaction',async()=>{
  const db=fakeDb();
  const result=await diagnoseWithDb(db,env,{fetcher:provider});
  assert.equal(result.diagnostic.facts.databaseMatchesCanonicalWriterPeriod,true);
  assert.equal(db.calls[0],'BEGIN READ ONLY');
  assert.equal(db.calls.at(-1),'ROLLBACK');
  assert.match(db.calls.find(x=>x.includes('FROM public."User"')),/"roles"::text\[\]/);
  for(const sql of db.calls)assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|COMMIT)\b/i);
});
test('refuses foreign owner and rolls back before looking up private records',async()=>{
  const db=fakeDb({...user,stripeCustomerId:'cus_foreign'});
  await assert.rejects(diagnoseWithDb(db,env,{fetcher:provider}),/FOREIGN_STRIPE_SUBSCRIPTION_REFUSED/);
  assert.equal(db.calls.at(-1),'ROLLBACK');
  assert.equal(db.calls.some(s=>s.includes('FROM public."FeatureGrant"')),false);
});
test('non-student roles are refused before Stripe call',async()=>{
  const db=fakeDb({...user,roles:['student','teacher']});
  let called=false;
  await assert.rejects(diagnoseWithDb(db,env,{fetcher:async()=>{called=true;return provider();}}),/DEDICATED_NONEXEMPT_STUDENT_REQUIRED/);
  assert.equal(called,false);
  assert.equal(db.calls.at(-1),'ROLLBACK');
});
test('source contains no Stripe write or database mutation operation',()=>{
  const source=readFileSync(new URL('./diagnose-stripe-lifecycle-v12j6e.mjs',import.meta.url),'utf8');
  assert.match(source,/BEGIN READ ONLY/);
  assert.match(source,/ROLLBACK/);
  assert.doesNotMatch(source,/\.subscriptions\.(?:update|cancel|create)|\/v1\/subscriptions\/.*(?:DELETE|POST)/);
  assert.doesNotMatch(source,/(?:client|pool)\.query\(\s*`(?:UPDATE|INSERT|DELETE|TRUNCATE)\b/);
});

test('diagnostic reads UTC timestamp values across period, grants, and ledger',async()=>{
  const db=fakeDb();
  const outcome=await diagnoseWithDb(db,env,{fetcher:provider});
  assert.equal(outcome.diagnostic.facts.databaseMatchesCanonicalWriterPeriod,true);
  assert.equal(outcome.diagnostic.facts.subscriptionGrantCounts.build_ai_generate.active,1);
  const sql=db.calls.join('\n');
  for(const field of ['currentPeriodEnd','updatedAt','startsAt','endsAt','revokedAt','processedAt','receivedAt']) {
    assert.ok(sql.includes(`("${field}" AT TIME ZONE 'UTC') AS "${field}"`),field);
  }
  assert.equal(db.calls[0],'BEGIN READ ONLY');
  assert.equal(db.calls.at(-1),'ROLLBACK');
});
