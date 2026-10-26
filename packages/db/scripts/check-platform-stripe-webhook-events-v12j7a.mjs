#!/usr/bin/env node
/**
 * V12J.7A — platform Stripe webhook event configuration parity.
 * READ ONLY. No Stripe mutations, DB access, schema changes, or credential output.
 *
 * Source of truth: existing Web billing dispatcher export. This script does not
 * maintain an independent copy of the supported-event list.
 * Storefront payment-provider webhooks are separate and are NOT covered here.
 */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DISPATCHER_PATH='apps/web/src/lib/billing/stripeWebhookReconciliation.ts';
export const PLATFORM_ROUTE_PATH='apps/web/src/app/api/stripe/webhook/route.ts';
export const LOCAL_FORWARD_URL='http://localhost:3000/api/stripe/webhook';

export class ParityRefusal extends Error {
  constructor(code) {super(code);this.name='ParityRefusal';}
}

const mandatory=['customer.subscription.deleted','customer.subscription.updated','invoice.paid','checkout.session.completed'];

export function extractCanonicalEvents(source) {
  // Validate a static array of string literals; refuse computed JS expressions.
  const match=source.match(/export\s+const\s+RELEVANT_STRIPE_BILLING_EVENT_TYPES\s*=\s*\[([\s\S]*?)\]\s*as\s+const\s*;/);
  if(!match)throw new ParityRefusal('CANONICAL_DISPATCHER_EVENT_ARRAY_UNAVAILABLE');
  const list=[];
  const residue=match[1].replace(/"([a-z][a-z0-9_.]*)"\s*,?/g,(_all,event)=>{list.push(event);return '';});
  if(residue.trim() || list.length===0 || new Set(list).size!==list.length ||
      list.some(event=>!event.includes('.')) || mandatory.some(event=>!list.includes(event))) {
    throw new ParityRefusal('CANONICAL_DISPATCHER_EVENT_ARRAY_INVALID');
  }
  return list;
}

export function loadCanonicalEvents(root=repoRoot) {
  const source=readFileSync(resolve(root,DISPATCHER_PATH),'utf8');
  const route=readFileSync(resolve(root,PLATFORM_ROUTE_PATH),'utf8');
  if(!route.includes('isRelevantStripeBillingEventType') ||
      !route.includes('reconcileStripeBillingEvent') ||
      !route.includes('STRIPE_WEBHOOK_SECRET')) {
    throw new ParityRefusal('WEBHOOK_ROUTE_NOT_USING_CANONICAL_DISPATCHER');
  }
  return extractCanonicalEvents(source);
}

export function parseEventCsv(text) {
  if(typeof text!=='string' || !text.trim())throw new ParityRefusal('EVENT_LIST_REQUIRED');
  const values=text.split(',').map(x=>x.trim());
  if(values.some(x=>!/^([a-z][a-z0-9_.]*|\*)$/.test(x)))throw new ParityRefusal('INVALID_EVENT_LIST');
  if(new Set(values).size!==values.length)throw new ParityRefusal('DUPLICATE_CONFIGURED_EVENTS');
  return values;
}

export function compareEvents(required,configured) {
  // Fail closed on '*': selection-required Stripe event types may not be
  // generated for a wildcard endpoint. Require explicit parity for all types.
  return {expected:required.length, configured:configured.length,
    missing:required.filter(type=>!configured.includes(type)),
    extra:configured.filter(type=>type!=='*' && !required.includes(type))};
}

export function validateRegisteredTarget(url) {
  if(typeof url!=='string' || url.length>2048)throw new ParityRefusal('REGISTERED_ENDPOINT_HTTPS_URL_REQUIRED');
  let parsed;
  try {parsed=new URL(url);} catch {throw new ParityRefusal('REGISTERED_ENDPOINT_HTTPS_URL_REQUIRED');}
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname!=='/api/stripe/webhook') {
    throw new ParityRefusal('REGISTERED_ENDPOINT_HTTPS_URL_REQUIRED');
  }
  return parsed.href;
}

export async function listTestStripeWebhookEndpoints(secret,{fetcher=fetch,maxPages=5}={}) {
  if(typeof secret!=='string' || !secret.startsWith('sk_test_')) {
    throw new ParityRefusal('TEST_MODE_SECRET_KEY_REQUIRED');
  }
  const result=[];
  let after='';
  for(let i=0;i<maxPages;i++) {
    const url=new URL('https://api.stripe.com/v1/webhook_endpoints');
    url.searchParams.set('limit','100');
    if(after)url.searchParams.set('starting_after',after);
    // Stripe GET only. Do not expose Authorization or remote response contents.
    const res=await fetcher(url.toString(),{
      method:'GET', headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(12000),
    });
    if(!res.ok)throw new ParityRefusal(`STRIPE_READ_FAILED_HTTP_${res.status}`);
    const body=await res.json();
    if(!Array.isArray(body?.data) || typeof body?.has_more!=='boolean') {
      throw new ParityRefusal('STRIPE_ENDPOINT_RESPONSE_INVALID');
    }
    result.push(...body.data);
    if(!body.has_more)return result;
    after=body.data.at(-1)?.id;
    if(typeof after!=='string' || !after)throw new ParityRefusal('STRIPE_ENDPOINT_PAGINATION_INVALID');
  }
  throw new ParityRefusal('STRIPE_ENDPOINT_PAGINATION_INCOMPLETE');
}

export function checkRegisteredEndpoints(required, endpoints, target) {
  const exact=endpoints.filter(e=>e?.url===target && e?.livemode===false && e?.connect!==true);
  if(exact.length===0)return {pass:false,reason:'NO_MATCHING_TEST_MODE_PLATFORM_ENDPOINT',matches:0,missing:required};
  if(exact.length!==1)return {pass:false,reason:'DUPLICATE_REGISTERED_PLATFORM_ENDPOINTS',matches:exact.length,missing:[]};
  const item=exact[0];
  if(item.status!=='enabled')return {pass:false,reason:'REGISTERED_PLATFORM_ENDPOINT_DISABLED',matches:1,missing:required};
  if(!Array.isArray(item.enabled_events))return {pass:false,reason:'REGISTERED_ENDPOINT_EVENT_LIST_MISSING',matches:1,missing:required};
  const compared=compareEvents(required,item.enabled_events);
  return {pass:compared.missing.length===0,reason:compared.missing.length?'REGISTERED_EVENT_GAPS':'REGISTERED_ENDPOINT_PARITY_PASS',matches:1,missing:compared.missing};
}

function help() {
  console.log('Usage:');
  console.log('  node packages/db/scripts/check-platform-stripe-webhook-events-v12j7a.mjs --print-listen');
  console.log('  node packages/db/scripts/check-platform-stripe-webhook-events-v12j7a.mjs --check-listener-events "event.one,event.two"');
  console.log('  node --env-file=.env.shared.local packages/db/scripts/check-platform-stripe-webhook-events-v12j7a.mjs --check-registered https://your-host/api/stripe/webhook');
  console.log('READ_ONLY=YES STORE_FRONT_WEBHOOKS=SEPARATE STRIPE_TEST_API=GET_ONLY');
}

export async function run(args, {root=repoRoot, env=process.env, fetcher=fetch, emit=console.log}={}) {
  if(args.length===0 || args[0]==='--help') {help();return 0;}
  const required=loadCanonicalEvents(root);
  emit(`CANONICAL_WEBHOOK_EVENTS=${required.length} SOURCE=${DISPATCHER_PATH}`);
  if(args.length===1 && args[0]==='--print-listen') {
    emit('CANONICAL_STRIPE_LISTENER_COMMAND:');
    emit(`stripe listen --events ${required.join(',')} --forward-to ${LOCAL_FORWARD_URL}`);
    emit('SAFETY=Rotate previously exposed local webhook signing secret; never share whsec_ values.');
    return 0;
  }
  if(args.length===2 && args[0]==='--check-listener-events') {
    const configured=parseEventCsv(args[1]);
    const diff=compareEvents(required,configured);
    emit(`LISTENER_PARITY expected=${diff.expected} configured=${diff.configured} missing=${diff.missing.length} extra=${diff.extra.length}`);
    for(const item of diff.missing)emit(`MISSING ${item}`);
    for(const item of diff.extra)emit(`EXTRA ${item}`);
    emit(diff.missing.length?'V12J7A_LISTENER_REVIEW':'V12J7A_LISTENER_PASS');
    return diff.missing.length?2:0;
  }
  if(args.length===2 && args[0]==='--check-registered') {
    const url=validateRegisteredTarget(args[1]);
    const endpoints=await listTestStripeWebhookEndpoints(env.LEARNOIR_STRIPE_SECRET_KEY,{fetcher});
    const result=checkRegisteredEndpoints(required,endpoints,url);
    emit(`REGISTERED_ENDPOINT_AUDIT matches=${result.matches} expected=${required.length} missing=${result.missing.length}`);
    for(const item of result.missing)emit(`MISSING ${item}`);
    emit(`V12J7A_${result.pass?'REGISTERED_PASS':'REGISTERED_REVIEW'} reason=${result.reason} stripe=GET_ONLY mutations=NO`);
    return result.pass?0:2;
  }
  throw new ParityRefusal('UNKNOWN_ARGUMENTS');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const code=await run(process.argv.slice(2));
    if(code)process.exitCode=code;
  } catch(error) {
    console.error(`V12J7A_REFUSED ${error instanceof ParityRefusal?error.message:'UNEXPECTED_READ_FAILURE'}`);
    process.exitCode=2;
  }
}
