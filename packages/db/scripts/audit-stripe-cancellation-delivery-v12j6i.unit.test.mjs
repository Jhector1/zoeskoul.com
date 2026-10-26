import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCancellationWithDb, classifyCancellation, listRelevantStripeEvents } from './audit-stripe-cancellation-delivery-v12j6i.mjs';
import { LifecycleRefusal } from './check-stripe-lifecycle-v12j6c.mjs';

const now=new Date('2026-10-23T16:00:00.000Z');
const user={id:'user_fixture',email:'billing-test@example.test',roles:['student'],stripeCustomerId:'cus_fixture'};
const remote={id:'sub_fixture_12345',object:'subscription',livemode:false,status:'canceled',customer:'cus_fixture',metadata:{userId:user.id},
  items:{data:[{price:{id:'price_fixture',product:'prod_fixture'},current_period_end:1795000000}]}};
const env={BILLING_LIFECYCLE_APPROVAL:'V12J6C_READ_ONLY_DEDICATED_TEST_ACCOUNT',
  BILLING_LIFECYCLE_CONFIRMED_DATABASE:'learnoir_db',BILLING_LIFECYCLE_CONFIRMED_ROLE:'admin',
  LEARNOIR_STRIPE_SECRET_KEY:'sk_test_fixture', BILLING_LIFECYCLE_TEST_EMAIL:user.email,
  BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID:remote.id,ZOEBUILD_AI_STRIPE_PRICE_IDS:'price_fixture',
  ZOEBUILD_AI_STRIPE_PRODUCT_IDS:'prod_fixture'};
const deleteEvent={id:'evt_delete_0001',object:'event',livemode:false,type:'customer.subscription.deleted',created:1792760000,
  data:{object:{id:remote.id,customer:user.stripeCustomerId}}};
const updateEvent={...deleteEvent,id:'evt_update_0002',type:'customer.subscription.updated'};
function state({db='active',grants=true,events=[deleteEvent],ledger='missing',roles=['student'],foreign=false,
  hasMore=false,customer='cus_fixture',remoteStatus='canceled'}={}){
  const calls=[];
  const pg={calls,async query(sql, params){calls.push(sql);
    if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(sql.includes('current_database()'))return {rows:[{db:'learnoir_db',role:'admin',schema:'public',read_only:'on'}]};
    if(sql.includes('FROM public."User"'))return {rows:[{...user,roles}]};
    if(sql.includes('FROM public."Subscription"'))return {rows:[{userId:foreign?'foreign':user.id,stripeCustomerId:customer,status:db,billingProduct:'builder_ai'}]};
    if(sql.includes('FROM public."FeatureGrant"'))return {rows:grants?[
      {feature:'build_ai_generate',startsAt:new Date('2026-10-01T00:00:00Z'),endsAt:null,revokedAt:null},
      {feature:'build_ai_edit',startsAt:new Date('2026-10-01T00:00:00Z'),endsAt:null,revokedAt:null}]:[]};
    if(sql.includes('FROM public."StripeEvent"'))return {rows:ledger==='missing'?[]:events.map(e=>({id:e.id,type:e.type,status:ledger,attemptCount:1,processedAt:new Date(),lastError:ledger==='failed'?'inaccessible token etc':null}))};
    throw Error('UNEXPECTED_SQL: '+sql);
  }};
  const fetches=[];
  const fetcher=async(url,options)=>{fetches.push({url,options});
    if(url.includes('/v1/subscriptions/'))return {ok:true,json:async()=>({...remote,status:remoteStatus})};
    if(url.includes('/v1/events?'))return {ok:true,json:async()=>({object:'list',data:events,has_more:hasMore})};
    throw Error('Unexpected url');
  };
  return {pg,fetcher,fetches};
}
async function run(overrides={}, envOverrides={}){
  const s=state(overrides);
  const result=await auditCancellationWithDb(s.pg,{...env,...envOverrides},{fetcher:s.fetcher,now});
  return {...s,result};
}
test('Stripe deletion present but absent from local ledger identifies forwarding or signature problem',async()=>{
  const {result,pg,fetches}=await run();
  assert.equal(result.facts.next,'STRIPE_DELETION_EVENT_MISSING_LOCALLY_CHECK_FORWARDER');
  assert.equal(result.facts.activeGrantCount,2);
  assert.equal(result.facts.localStatus,'active');
  assert.equal(result.facts.stripeDeletionEvents,1);
  assert.equal(result.facts.eventOutcomes[0].ledger,'missing');
  assert.equal(fetches.length,2);
  assert.equal(pg.calls[0],'BEGIN READ ONLY');
  assert.equal(pg.calls.at(-1),'ROLLBACK');
  assert.match(pg.calls.join('\n'),/"roles"::text\[\]/);
  assert.match(pg.calls.join('\n'),/"startsAt" AT TIME ZONE 'UTC'/);
  for(const sql of pg.calls) assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|COMMIT)\b/i);
});
test('failed and ignored delivery records are classified without exposing error text',async()=>{
  for(const [ledger,next] of [['failed','DELETION_LEDGER_FAILED_CHECK_WEB_SERVER_LOG'],['ignored','DELETION_LEDGER_IGNORED_CHECK_MAPPING'],
    ['processing','DELETION_STILL_PROCESSING_CHECK_WEB_SERVER_LOG']]){
    const {result}=await run({ledger});
    assert.equal(result.facts.next,next);
    assert.equal(result.facts.eventOutcomes[0].hasRecordedError,ledger==='failed');
    assert.doesNotMatch(JSON.stringify(result.facts),/inaccessible token/);
  }
});
test('processed deletion but active DB or grants is a reconciliation defect',async()=>{
  const result=(await run({ledger:'processed'})).result;
  assert.equal(result.facts.next,'PROCESSED_DELETION_BUT_DATABASE_STATE_STALE');
  assert.equal(result.facts.deletedProcessed,true);
});
test('fully reconciled canceled subscription and revoked grants passes',async()=>{
  const result=(await run({db:'canceled',grants:false,ledger:'processed'})).result;
  assert.equal(result.facts.next,'RECONCILIATION_COMPLETE');
  assert.equal(result.facts.activeGrantCount,0);
});
test('no provider deletion event is distinguished from a truncated event scan',async()=>{
  const a=(await run({events:[updateEvent]})).result;
  assert.equal(a.facts.next,'NO_MATCHING_DELETION_EVENT_IN_SEVEN_DAY_STRIPE_WINDOW');
  const b=(await run({events:[updateEvent],hasMore:true})).result;
  assert.equal(b.facts.next,'EVENT_SCAN_INCOMPLETE_CANNOT_RULE_OUT_DELETION');
  assert.equal(b.stripeScan.pages,4);
});
test('wrong Stripe customer in list is not a matching event',async()=>{
  const stale={...deleteEvent,data:{object:{id:remote.id,customer:'cus_foreign'}}};
  const result=(await run({events:[stale]})).result;
  assert.equal(result.facts.stripeDeletionEvents,0);
  assert.equal(result.facts.next,'NO_MATCHING_DELETION_EVENT_IN_SEVEN_DAY_STRIPE_WINDOW');
});
test('unparsed or privileged account rejected before any Stripe calls',async()=>{
  for(const roles of [['teacher'],['student','admin'],'{student}']){
    const s=state({roles});
    await assert.rejects(auditCancellationWithDb(s.pg,env,{fetcher:s.fetcher,now}),e=>
      e instanceof LifecycleRefusal && e.message==='DEDICATED_STUDENT_OWNER_NOT_FOUND');
    assert.equal(s.fetches.length,0);
    assert.equal(s.pg.calls.at(-1),'ROLLBACK');
  }
});
test('foreign local subscription blocked before event list',async()=>{
  const s=state({foreign:true});
  await assert.rejects(auditCancellationWithDb(s.pg,env,{fetcher:s.fetcher,now}),e=>
    e instanceof LifecycleRefusal && e.message==='LOCAL_BUILDER_SUBSCRIPTION_OWNER_MISMATCH');
  assert.equal(s.fetches.length,1);
  assert.equal(s.pg.calls.at(-1),'ROLLBACK');
});
test('wrong database and production Stripe secret fail closed',async()=>{
  const s=state();
  await assert.rejects(auditCancellationWithDb(s.pg,{...env,BILLING_LIFECYCLE_CONFIRMED_DATABASE:'wrong'},{fetcher:s.fetcher,now}),
    e=>e instanceof LifecycleRefusal && e.message==='DATABASE_IDENTITY_MISMATCH');
  assert.equal(s.fetches.length,0);
  const other=state();
  await assert.rejects(auditCancellationWithDb(other.pg,{...env,LEARNOIR_STRIPE_SECRET_KEY:'sk_live_forbidden'},{fetcher:other.fetcher,now}),
    e=>e instanceof LifecycleRefusal);
  assert.equal(other.fetches.length,0);
});
test('Stripe event listing is GET only, bound to a seven-day window and limited pagination',async()=>{
  const urls=[];
  const outcome=await listRelevantStripeEvents({subscriptionId:remote.id,customerId:user.stripeCustomerId,secret:env.LEARNOIR_STRIPE_SECRET_KEY,
    now,maxPages:2,fetcher:async(url,args)=>{urls.push(url);assert.equal(args.method,'GET');return {ok:true,json:async()=>({object:'list',has_more:true,data:[deleteEvent]})};}});
  assert.equal(outcome.complete,false);
  assert.equal(urls.length,2);
  const first=new URL(urls[0]);
  assert.equal(first.searchParams.get('types[0]'),'customer.subscription.deleted');
  assert.equal(first.searchParams.get('types[1]'),'customer.subscription.updated');
  assert.ok(first.searchParams.has('created[gte]'));
  assert.equal(new URL(urls[1]).searchParams.get('starting_after'),deleteEvent.id);
});
