import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../../../apps/zoebuild/src/app/[locale]/billing/BuilderBillingClient.tsx',import.meta.url),'utf8');
test('the current billing mode is never read unsafely in the unverified UI',()=>{
  assert.match(src,/verification\?\.mode==="missing"/);
  assert.match(src,/verification\?\.mode==="live"/);
});
test('checkout is disabled until verification is present, not unavailable, and Stripe configured',()=>{
  assert.match(src,/disabled=\{busy\|\|!verification\|\|verificationUnavailable\|\|verification\.mode==="missing"\}/);
});
test('outage does not show stale active subscription or solicit a new purchase',()=>{
  assert.match(src,/verificationUnavailable\?"Verification unavailable"/);
  assert.match(src,/Current subscription status cannot be verified/);
  assert.match(src,/Do not subscribe again/);
});
test('no synthetic credits or entitlement bypass in billing interface',()=>{
  assert.doesNotMatch(src,/grantAiCreditLot|featureGrant\.(?:create|upsert)|STRIPE_SECRET_KEY/);
});
