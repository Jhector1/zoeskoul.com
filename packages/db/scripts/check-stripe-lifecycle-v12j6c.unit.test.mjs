import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LifecycleRefusal, validateDedicatedEmail, validateCheckArgs, platformPriceSets,
  fetchStripeTestSubscription, evaluateLifecycle, evaluateLearningIsolation, checkWithDb,
} from './check-stripe-lifecycle-v12j6c.mjs';

const env = {
  BILLING_LIFECYCLE_APPROVAL: 'V12J6C_READ_ONLY_DEDICATED_TEST_ACCOUNT',
  BILLING_LIFECYCLE_CONFIRMED_DATABASE: 'learnoir_db',
  BILLING_LIFECYCLE_CONFIRMED_ROLE: 'admin',
  BILLING_LIFECYCLE_TEST_EMAIL: 'my+billing-test@example.org',
  BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID: 'sub_fake12345',
  LEARNOIR_STRIPE_SECRET_KEY: 'sk_test_synthetic_only',
  STRIPE_PRICE_MONTHLY_ID: 'price_learning',
  STRIPE_PRICE_YEARLY_ID: 'price_annual',
  ZOEBUILD_AI_STRIPE_PRICE_IDS: 'price_builder',
  ZOEBUILD_AI_STRIPE_PRODUCT_IDS: 'prod_builder',
};
const email = env.BILLING_LIFECYCLE_TEST_EMAIL;
const user = { id: 'account-secret', email, roles: ['student'], stripeCustomerId: 'cus_secret' };
const future = new Date('2030-11-22T20:06:44.000Z');
const remoteBase = {
  object: 'subscription', id: env.BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID,
  livemode: false, status: 'active', cancel_at_period_end: false, cancel_at: null,
  customer: 'cus_secret', metadata: { userId: user.id, billingProduct: 'builder_ai' },
  items: { data: [{ current_period_end: Math.floor(future.getTime()/1000),
    price: { id: 'price_builder', product: 'prod_builder' } }] },
};
const rowBase = { userId: user.id, stripeSubscriptionId: remoteBase.id, stripeCustomerId: user.stripeCustomerId,
  billingProduct: 'builder_ai', priceId: 'price_builder', status: 'active',
  currentPeriodEnd: future, cancelAtPeriodEnd: false };
const grantsActive = ['build_ai_generate', 'build_ai_edit'].map(feature => ({feature, type:'subscription',
  revokedAt:null,startsAt:null,endsAt:future }));
const transition = (type = 'customer.subscription.updated', status = 'processed') => [{type,status,livemode:false}];
const base = {
  product:'builder_ai',stage:'active', email, subscriptionId:remoteBase.id,
  prices:platformPriceSets(env),user,rows:[rowBase],grants:grantsActive,
  events:transition('customer.subscription.created'),remote:remoteBase,now:new Date('2030-10-23T12:00:00.000Z'),
};
const check = patch => evaluateLifecycle({...base,...patch});

test('dedicated billing-test marker is mandatory; current ordinary account cannot be targeted', () => {
  assert.equal(validateDedicatedEmail(email), email);
  assert.throws(() => validateDedicatedEmail('regular@example.org'), LifecycleRefusal);
  assert.throws(() => validateDedicatedEmail('owner@billing-test.example.org'), LifecycleRefusal);
});
test('explicit test-mode key, approval, exact product, and exact subscription are required', () => {
  assert.equal(validateCheckArgs(env,['--check','builder_ai','active']).stage,'active');
  for(const patch of [
    { LEARNOIR_STRIPE_SECRET_KEY: 'sk_live_sensitive' },
    { BILLING_LIFECYCLE_APPROVAL: '' },
    { BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID: '' },
    { BILLING_LIFECYCLE_CONFIRMED_ROLE: '' },
    { BILLING_LIFECYCLE_TEST_EMAIL: 'regular@example.org' },
  ]) assert.throws(()=>validateCheckArgs({...env,...patch},['--check','builder_ai','active']), LifecycleRefusal);
  assert.throws(()=>validateCheckArgs(env,['--check','other','active']), LifecycleRefusal);
});
test('live Stripe integration is GET-only and never prints payment or customer identifiers', async () => {
  const calls=[];
  const result=await fetchStripeTestSubscription(remoteBase.id,env.LEARNOIR_STRIPE_SECRET_KEY,async (url,options)=>{
    calls.push({url,method:options.method});
    return {ok:true,json:async()=>remoteBase};
  });
  assert.equal(result.id,remoteBase.id);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'GET');
  assert.ok(calls[0].url.includes('/v1/subscriptions/'));
  await assert.rejects(fetchStripeTestSubscription(remoteBase.id,'sk_live_bad',()=>{}),LifecycleRefusal);
  await assert.rejects(fetchStripeTestSubscription(remoteBase.id,env.LEARNOIR_STRIPE_SECRET_KEY,
    async()=>({ok:true,json:async()=>({...remoteBase,livemode:true})})),LifecycleRefusal);
});
test('valid newly-created subscription requires matching provider, database, processed event and grants',()=>{
  const result=check({});
  assert.equal(result.passed,true, result.problems.join(','));
  const output=JSON.stringify(result);
  for (const privateValue of [remoteBase.id,user.id,user.email,user.stripeCustomerId, 'price_builder']) {
    assert.equal(output.includes(privateValue),false,`leaked ${privateValue}`);
  }
});
test('scheduled cancellation keeps grants, requires a provider cancellation date and webhook',()=>{
  const remote={...remoteBase,cancel_at_period_end:true,cancel_at:Math.floor(future.getTime()/1000)};
  const row={...rowBase,cancelAtPeriodEnd:true};
  const result=check({stage:'scheduled',remote,rows:[row],events:transition()});
  assert.equal(result.passed,true,result.problems.join(','));
  assert.ok(check({stage:'scheduled',remote:{...remote,cancel_at:null},rows:[row]}).problems.includes('SCHEDULED_CANCELLATION_DATE_MISSING'));
});
test('resumption requires live and persisted cancellation flag both cleared',()=>{
  const result=check({stage:'resumed',events:transition()});
  assert.equal(result.passed,true,result.problems.join(','));
  assert.equal(check({stage:'resumed',remote:{...remoteBase,cancel_at_period_end:true},events:transition()}).passed,false);
});
test('immediate cancellation requires terminal Stripe status, processed deletion and revoked grants',()=>{
  const remote={...remoteBase,status:'canceled'};
  const row={...rowBase,status:'canceled'};
  const result=check({stage:'canceled',remote,rows:[row],grants:[],events:transition('customer.subscription.deleted')});
  assert.equal(result.passed,true,result.problems.join(','));
  assert.ok(check({stage:'canceled',remote,rows:[row],grants:grantsActive,
    events:transition('customer.subscription.deleted')}).problems.includes('BUILDER_BUILD_AI_GENERATE_GRANT_MISMATCH'));
});
test('Learning is independent and requires a correctly-priced subscription and non-exempt role',()=>{
  const prices=platformPriceSets(env);
  const remote={...remoteBase,metadata:{userId:user.id,billingProduct:'learning'},
    items:{data:[{current_period_end:remoteBase.items.data[0].current_period_end,
      price:{id:'price_learning',product:'prod_learning'}}]}};
  const row={...rowBase,billingProduct:'learning',priceId:'price_learning'};
  const result=check({product:'learning',remote,rows:[row],grants:[],prices});
  assert.equal(result.passed,true,result.problems.join(','));
  assert.equal(check({product:'learning',remote,rows:[row],user:{...user,roles:['teacher']}}).passed,false);
  assert.ok(check({product:'learning',remote,rows:[{...row,priceId:'price_builder'}]}).problems.includes('LOCAL_BILLING_PRODUCT_OR_PRICE_MISMATCH'));
});
test('provider/customer drift, unrecognized catalog, mismatched period and failed webhook are blockers',()=>{
  const cases=[
    {patch:{remote:{...remoteBase,customer:'cus_foreign'}},issue:'CUSTOMER_OWNERSHIP_MISMATCH'},
    {patch:{remote:{...remoteBase,metadata:{userId:'foreign'}}},issue:'STRIPE_METADATA_OWNER_MISMATCH'},
    {patch:{remote:{...remoteBase,items:{data:[{price:{id:'price_unknown',product:'prod_builder'},current_period_end:Math.floor(future.getTime()/1000)}]}}},issue:'STRIPE_PRICE_NOT_IN_PRODUCT_CATALOG'},
    {patch:{rows:[{...rowBase,currentPeriodEnd:new Date('2030-11-10T00:00:00Z')}]},issue:'LOCAL_BILLING_PERIOD_MISMATCH'},
    {patch:{events:transition('customer.subscription.created','failed')},issue:'LATEST_SUBSCRIPTION_WEBHOOK_NOT_PROCESSED'},
    {patch:{rows:[]},issue:'SUBSCRIPTION_NOT_RECONCILED_IN_POSTGRES'},
  ];
  for(const {patch,issue} of cases) assert.ok(check(patch).problems.includes(issue),issue);
});
function fakeClient() {
  const calls=[];
  return {calls,async query(sql) {
    calls.push(sql);
    if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(sql.includes('current_database()'))return {rows:[{db:'learnoir_db',role:'admin',schema:'public',read_only:'on',replica:false}]};
    if(sql.includes('FROM public."User"'))return {rows:[user]};
    if(sql.includes('FROM public."Subscription"'))return {rows:[rowBase]};
    if(sql.includes('FROM public."FeatureGrant"'))return {rows:grantsActive};
    if(sql.includes('FROM public."StripeEvent"'))return {rows:transition('customer.subscription.created')};
    throw Error('unexpected query');
  }};
}
test('Postgres inspection is read-only and does not query Stripe or accounts',async()=>{
  const client=fakeClient();
  const r=await checkWithDb(client,env,{inspect:true});
  assert.equal(r.identity.db,'learnoir_db');
  assert.deepEqual(client.calls,['BEGIN READ ONLY',client.calls[1],'ROLLBACK']);
  assert.equal(client.calls.length,3);
});
test('DB checkpoint is READ ONLY with rollback and one live GET; wrong owner refuses',async()=>{
  const client=fakeClient();
  const result=await checkWithDb(client,env,{args:['--check','builder_ai','active'],
    fetcher:async()=>({ok:true,json:async()=>remoteBase})});
  assert.equal(result.result.passed,true,result.result.problems.join(','));
  assert.equal(client.calls.filter(sql=>sql.includes('FROM public."User"')).length,1);
  assert.match(client.calls.find(sql=>sql.includes('FROM public."User"')), /"roles"::text\[\] AS "roles"/);
  assert.equal(client.calls[0],'BEGIN READ ONLY');
  assert.equal(client.calls.at(-1),'ROLLBACK');
  for(const sql of client.calls)assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|COMMIT)\b/i);
  const bad=fakeClient();
  await assert.rejects(checkWithDb(bad,env,{args:['--check','builder_ai','active'],
    fetcher:async()=>({ok:true,json:async()=>({...remoteBase,customer:'cus_foreign'})})}),LifecycleRefusal);
  assert.equal(bad.calls.at(-1),'ROLLBACK');
  assert.equal(bad.calls.some(x=>x.includes('FROM public."Subscription"')),false);
});

// PostgreSQL custom enum arrays can arrive as raw strings without the SQL cast.
// Do not accept a raw string as role evidence, even when it resembles a student.
test('unparsed custom-enum role arrays fail closed instead of bypassing student guard',async()=>{
  const client=fakeClient();
  const rawQuery=client.query.bind(client);
  client.query=async sql=>{
    const result=await rawQuery(sql);
    if(sql.includes('FROM public."User"'))return {rows:[{...user,roles:'{student}'}]};
    return result;
  };
  await assert.rejects(checkWithDb(client,env,{args:['--check','builder_ai','active'],
    fetcher:async()=>({ok:true,json:async()=>remoteBase})}),e=>
    e instanceof LifecycleRefusal && e.message==='NONEXEMPT_STUDENT_ACCOUNT_REQUIRED');
  assert.equal(client.calls.at(-1),'ROLLBACK');
});

// PostgreSQL's timestamp(3) without time zone holds a UTC clock written by
// Prisma. PG must interpret that clock explicitly as UTC, not as Chicago time.
test('raw PostgreSQL timestamp readers use UTC for periods, grants and event clocks', async () => {
  const client = fakeClient();
  const result = await checkWithDb(client, env, {args:['--check','builder_ai','active'],
    fetcher:async()=>({ok:true,json:async()=>remoteBase})});
  assert.equal(result.result.passed, true);
  const sql = client.calls.join('\n');
  for (const field of ['currentPeriodEnd','trialEnd','startsAt','endsAt','revokedAt','receivedAt']) {
    assert.ok(sql.includes(`("${field}" AT TIME ZONE 'UTC') AS "${field}"`), field);
  }
  assert.equal(client.calls[0], 'BEGIN READ ONLY');
  assert.equal(client.calls.at(-1), 'ROLLBACK');
});
test('local timezone parsing alone produces +5h in October and +6h in November', async () => {
  const {spawnSync} = await import('node:child_process');
  const code = `console.log(JSON.stringify(['2026-10-23 14:34:12', '2026-11-23 14:34:12'].map(s =>
    (new Date(s).getTime() - Date.parse(s.replace(' ', 'T')+'Z'))/3600000)))`;
  const child = spawnSync(process.execPath, ['-e', code], {
    encoding:'utf8', env:{...process.env,TZ:'America/Chicago'}});
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), [5, 6]);
});

// V12J.7B: Read-only Learning and Builder product isolation, scoped to the
// dedicated student account. These do NOT create or mutate subscriptions.
const learningRow = {...rowBase,billingProduct:'learning',priceId:'price_learning'};
const canceledBuilderRow = {...rowBase,stripeSubscriptionId:'sub_canceledBuilder12',status:'canceled'};
const learningIsolation = (patch={}) => evaluateLearningIsolation({
  stage:'active',subscriptionId:remoteBase.id,user,prices:platformPriceSets(env),
  subscriptions:[learningRow,canceledBuilderRow],grants:[],now:base.now,...patch,
});
test('Learning activation grants Learning only; canceled Builder stays disabled',()=>{
  const r=learningIsolation();
  assert.deepEqual(r.problems,[]);
  assert.deepEqual(r.facts,{learningAccessFromDb:true,targetLearningEligible:true,
    otherCurrentLearningSubscriptions:0,builderAccessFromDb:false,activeBuilderSubscriptionGrantCount:0});
  for (const secret of [user.id,user.email,user.stripeCustomerId,remoteBase.id])
    assert.ok(!JSON.stringify(r).includes(secret));
});
test('scheduled Learning cancellation and resumption retain current access',()=>{
  const scheduled=learningIsolation({stage:'scheduled',subscriptions:[{...learningRow,cancelAtPeriodEnd:true},canceledBuilderRow]});
  const resumed=learningIsolation({stage:'resumed'});
  assert.deepEqual(scheduled.problems,[]);
  assert.deepEqual(resumed.problems,[]);
  assert.equal(scheduled.facts.learningAccessFromDb,true);
});
test('Learning cancellation denies access even when old billing period remains in future',()=>{
  const result=learningIsolation({stage:'canceled',subscriptions:[{...learningRow,status:'canceled'},canceledBuilderRow]});
  assert.deepEqual(result.problems,[]);
  assert.equal(result.facts.learningAccessFromDb,false);
});
test('other active Learning subscription blocks claim that canceled product removed all access',()=>{
  const other={...learningRow,stripeSubscriptionId:'sub_otherLearn1234'};
  const r=learningIsolation({stage:'canceled',subscriptions:[{...learningRow,status:'canceled'},other,canceledBuilderRow]});
  assert.ok(r.problems.includes('OTHER_ACTIVE_LEARNING_SUBSCRIPTION_PREVENTS_ACCESS_DENIAL_TEST'));
  assert.equal(r.facts.learningAccessFromDb,true);
  assert.equal(r.facts.otherCurrentLearningSubscriptions,1);
});
test('wrong Stripe customer, wrong product, stale or expired periods do not grant Learning',()=>{
  const cases=[
    {...learningRow,stripeCustomerId:'cus_foreign'},
    {...learningRow,billingProduct:'builder_ai'},
    {...learningRow,priceId:'price_builder'},
    {...learningRow,status:'active',currentPeriodEnd:new Date('2020-01-01T00:00:00Z')},
    {...learningRow,status:'canceled'},
  ];
  for (const invalid of cases) {
    const r=learningIsolation({subscriptions:[invalid,canceledBuilderRow]});
    assert.ok(r.problems.includes('LEARNING_ENTITLEMENT_NOT_ACTIVE_AFTER_RECONCILIATION'));
  }
});
test('Learning purchase cannot authorize stale Builder grants from a canceled Builder plan',()=>{
  const r=learningIsolation({grants:grantsActive});
  assert.ok(r.problems.includes('BUILDER_GRANTS_PRESENT_WITHOUT_ELIGIBLE_BUILDER_PLAN'));
  assert.equal(r.facts.builderAccessFromDb,false);
  assert.equal(r.facts.activeBuilderSubscriptionGrantCount,2);
});
test('independent active Builder subscription legitimately coexists with Learning',()=>{
  const r=learningIsolation({subscriptions:[learningRow,rowBase],grants:grantsActive});
  assert.deepEqual(r.problems,[]);
  assert.equal(r.facts.builderAccessFromDb,true);
  assert.equal(r.facts.learningAccessFromDb,true);
});
test('Learning checkpoint reads all owned subscriptions read-only with UTC periods',async()=>{
  const client=fakeClient();
  const original=client.query.bind(client);
  client.query=async(sql, params)=>{
    if (sql.includes('FROM public."Subscription" WHERE "userId" = $1')) {
      client.calls.push(sql);
      assert.deepEqual(params,[user.id]);
      return {rows:[learningRow,canceledBuilderRow]};
    }
    if (sql.includes('FROM public."Subscription"')) {
      client.calls.push(sql);
      return {rows:[learningRow]};
    }
    if (sql.includes('FROM public."FeatureGrant"')) {client.calls.push(sql);return {rows:[]};}
    return original(sql,params);
  };
  const remote={...remoteBase,metadata:{userId:user.id,billingProduct:'learning'},
    items:{data:[{current_period_end:Math.floor(future.getTime()/1000),
      price:{id:'price_learning',product:'prod_learning'}}]}};
  const result=await checkWithDb(client,env,{args:['--check','learning','active'],
    fetcher:async()=>({ok:true,json:async()=>remote})});
  assert.equal(result.result.passed,true,result.result.problems.join(','));
  assert.equal(result.result.facts.learningAccessFromDb,true);
  assert.equal(result.result.facts.builderAccessFromDb,false);
  const sql=client.calls.find(s=>s.includes('FROM public."Subscription" WHERE "userId" = $1'));
  assert.match(sql,/"currentPeriodEnd" AT TIME ZONE 'UTC'/);
  assert.equal(client.calls[0],'BEGIN READ ONLY');
  assert.equal(client.calls.at(-1),'ROLLBACK');
});
test('Learning checkpoint refuses more than 100 local subscription rows without writing',async()=>{
  const client=fakeClient();
  const original=client.query.bind(client);
  client.query=async (sql,params)=>{
    if(sql.includes('FROM public."Subscription" WHERE "userId" = $1')) {
      client.calls.push(sql);return {rows:Array.from({length:101},()=>learningRow)};
    }
    if(sql.includes('FROM public."Subscription"')) {client.calls.push(sql);return {rows:[learningRow]};}
    if(sql.includes('FROM public."FeatureGrant"')) {client.calls.push(sql);return {rows:[]};}
    return original(sql,params);
  };
  const remote={...remoteBase,metadata:{userId:user.id,billingProduct:'learning'},
    items:{data:[{current_period_end:Math.floor(future.getTime()/1000),price:{id:'price_learning',product:'prod_learning'}}]}};
  await assert.rejects(checkWithDb(client,env,{args:['--check','learning','active'],
    fetcher:async()=>({ok:true,json:async()=>remote})}), e=>
    e instanceof LifecycleRefusal && e.message==='TOO_MANY_LOCAL_SUBSCRIPTIONS_FOR_LEARNING_AUDIT');
  assert.equal(client.calls.at(-1),'ROLLBACK');
});
