import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  extractCanonicalEvents, loadCanonicalEvents, parseEventCsv, compareEvents,
  checkRegisteredEndpoints, validateRegisteredTarget, listTestStripeWebhookEndpoints,
  run, ParityRefusal, DISPATCHER_PATH,
} from './check-platform-stripe-webhook-events-v12j7a.mjs';
const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const canonical=loadCanonicalEvents(repo);
const oldEvents='customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,invoice.paid,invoice.payment_failed';

function endpoint(overrides={}) {
 return {id:'we_test',url:'https://billing.example.test/api/stripe/webhook',status:'enabled',
   livemode:false,connect:false,enabled_events:[...canonical],...overrides};
}
test('exact Web billing dispatcher is the source of truth, not copied into the script',()=>{
 const s=readFileSync(resolve(repo,DISPATCHER_PATH),'utf8');
 assert.deepEqual(extractCanonicalEvents(s),canonical);
 assert.ok(canonical.length>=30);
 assert.ok(canonical.includes('customer.subscription.deleted'));
 assert.ok(canonical.includes('charge.dispute.closed'));
 assert.ok(canonical.includes('refund.failed'));
});
test('refuses missing dispatcher, computed code, duplicate or removed core events',()=>{
 assert.throws(()=>extractCanonicalEvents('export const events=[]'),ParityRefusal);
 const source=`export const RELEVANT_STRIPE_BILLING_EVENT_TYPES = [${canonical.map(e=>`"${e}"`).join(',')}] as const;`;
 assert.deepEqual(extractCanonicalEvents(source),canonical);
 assert.throws(()=>extractCanonicalEvents(source.replace('"customer.subscription.deleted"','someVar')),ParityRefusal);
 assert.throws(()=>extractCanonicalEvents(source.replace('"customer.subscription.deleted"','"customer.subscription.created"')),ParityRefusal);
 assert.throws(()=>extractCanonicalEvents(source.replace('"customer.subscription.deleted",','')),ParityRefusal);
});
test('past 6-event listener misses other required platform billing, risk and checkout events',()=>{
 const diff=compareEvents(canonical,parseEventCsv(oldEvents));
 assert.equal(diff.expected,canonical.length);
 assert.ok(diff.missing.includes('checkout.session.expired'));
 assert.ok(diff.missing.includes('charge.dispute.created'));
 assert.ok(diff.missing.includes('customer.deleted'));
 assert.equal(diff.missing.length,canonical.length-6);
});
test('canonical list passes, distinct extra events are only informational',()=>{
 assert.deepEqual(compareEvents(canonical,parseEventCsv(canonical.join(','))).missing,[]);
 assert.deepEqual(compareEvents(canonical,[...canonical,'charge.succeeded']).missing,[]);
 assert.throws(()=>parseEventCsv('customer.subscription.deleted,,invoice.paid'),ParityRefusal);
 assert.throws(()=>parseEventCsv('customer.subscription.deleted,customer.subscription.deleted'),ParityRefusal);
});
test('print command contains ALL current canonical events and no credential strings',async()=>{
 const output=[];const code=await run(['--print-listen'],{root:repo,emit:t=>output.push(t)});
 assert.equal(code,0);
 const combined=output.join('\n');
 for(const e of canonical)assert.ok(combined.includes(e));
 assert.ok(combined.includes('http://localhost:3000/api/stripe/webhook'));
 assert.doesNotMatch(combined,/whsec_[a-zA-Z0-9]{20,}|sk_(live|test)_/);
});
test('mismatched current listener exits nonzero; complete listener passes',async()=>{
 const messages=[];
 assert.equal(await run(['--check-listener-events',oldEvents],{root:repo,emit:t=>messages.push(t)}),2);
 assert.ok(messages.includes('V12J7A_LISTENER_REVIEW'));
 assert.equal(await run(['--check-listener-events',canonical.join(',')],{root:repo,emit:()=>{}}),0);
});
test('registered URLs must be HTTPS exact platform path, no credentials or query',()=>{
 assert.equal(validateRegisteredTarget('https://billing.example.test/api/stripe/webhook'),'https://billing.example.test/api/stripe/webhook');
 for(const url of ['http://billing.example.test/api/stripe/webhook','https://x.example/api/stripe/webhook?secret=yes',
  'https://user:pass@x.example/api/stripe/webhook','https://x.example/some/other/path']) {
  assert.throws(()=>validateRegisteredTarget(url),ParityRefusal);
 }
});
test('registered endpoint is required in correct mode, enabled, not Connect, no duplicates',()=>{
 const url=endpoint().url;
 for(const list of [[],[endpoint({status:'disabled'})],[endpoint({livemode:true})],
   [endpoint({connect:true})],[endpoint(),endpoint({id:'we_other'})]]) {
  assert.equal(checkRegisteredEndpoints(canonical,list,url).pass,false);
 }
 assert.equal(checkRegisteredEndpoints(canonical,[endpoint()],url).pass,true);
});
test('registered missing deletion fails; wildcard alone fails closed',()=>{
 const target=endpoint().url;
 const missing=checkRegisteredEndpoints(canonical,[endpoint({enabled_events:canonical.filter(e=>e!=='customer.subscription.deleted')})],target);
 assert.equal(missing.pass,false);
 assert.deepEqual(missing.missing,['customer.subscription.deleted']);
 assert.equal(checkRegisteredEndpoints(canonical,[endpoint({enabled_events:['*']})],target).pass,false);
 assert.equal(checkRegisteredEndpoints(canonical,[endpoint({enabled_events:['*',...canonical]})],target).pass,true);
});
test('only test-mode Stripe keys permitted and test API requests are GET only',async()=>{
 for(const key of ['sk_live_dummy','rk_test_dummy',''])await assert.rejects(
   ()=>listTestStripeWebhookEndpoints(key,{fetcher:async()=>{throw new Error('must not call')}}),ParityRefusal);
 let called=0;
 const endpoints=await listTestStripeWebhookEndpoints('sk_test_synthetic',{
   fetcher:async(url,opts)=>{
    called++;
    assert.equal(opts.method,'GET');
    assert.match(url,/^https:\/\/api\.stripe\.com\/v1\/webhook_endpoints\?/);
    assert.equal(opts.headers.Authorization,'Bearer sk_test_synthetic');
    return {ok:true,json:async()=>({has_more:false,data:[endpoint()]})};
   },
 });
 assert.equal(called,1);
 assert.equal(endpoints.length,1);
});
test('Stripe paginates safely and refuses incomplete or malformed scans',async()=>{
 let called=0;
 const endpoints=await listTestStripeWebhookEndpoints('sk_test_synthetic',{
   fetcher:async(url)=>{called++;if(called===2)assert.match(url,/starting_after=we_1/);
     return {ok:true,json:async()=>called===1?{data:[{id:'we_1'}],has_more:true}:{data:[{id:'we_2'}],has_more:false}};},
 });
 assert.equal(endpoints.length,2);
 await assert.rejects(()=>listTestStripeWebhookEndpoints('sk_test_synthetic',{
   maxPages:1,fetcher:async()=>({ok:true,json:async()=>({data:[{id:'we_1'}],has_more:true})})}),ParityRefusal);
});
test('registered check never prints credentials or webhook endpoint ids',async()=>{
 const logs=[];
 const code=await run(['--check-registered',endpoint().url],{root:repo,
   env:{LEARNOIR_STRIPE_SECRET_KEY:'sk_test_dummy_private'},
   fetcher:async()=>({ok:true,json:async()=>({has_more:false,data:[endpoint()]})}),emit:t=>logs.push(t)});
 assert.equal(code,0);
 assert.ok(logs.includes('V12J7A_REGISTERED_PASS reason=REGISTERED_ENDPOINT_PARITY_PASS stripe=GET_ONLY mutations=NO'));
 assert.doesNotMatch(logs.join('\n'),/sk_test_|whsec_|we_test/);
});
