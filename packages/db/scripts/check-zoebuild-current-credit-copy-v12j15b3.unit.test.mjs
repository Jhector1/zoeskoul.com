import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const file=readFileSync('apps/zoebuild/src/app/[locale]/billing/AiCreditsPanel.tsx','utf8');
const oldOne='Subscription checkout does not itself promise spendable AI units. AI billing and credit purchases remain unavailable until the server approves pricing and operations.';
const newOne='Your Builder subscription grants platform features, not included AI credits. A $5 Stripe test credit pack can be purchased when the server verifies it; metered AI usage remains disabled until model pricing and operations are approved.';
const oldTwo='Credit packs are not offered until paid-event funding, pricing and refund reconciliation have passed release acceptance. Manage your Stripe subscription using the button beside this panel.';
const newTwo='The $5 pack is offered in Stripe test mode only when verified by the server. Purchased credits are separate from subscriptions and do not yet enable paid AI usage. Manage your subscription through the separate Stripe management action.';
const baseHash='47aad4680d288be6233ac00abe4a1c479a4ab0e3d7e2eb8ace673f97e78b5bf2';
const sha=s=>createHash('sha256').update(s).digest('hex');
test('only two obsolete informational strings changed from the exact uploaded current component',()=>{
 assert.equal(file.includes(oldOne),false);assert.equal(file.includes(oldTwo),false);
 assert.equal(file.split(newOne).length,2);assert.equal(file.split(newTwo).length,2);
 assert.equal(sha(file.replace(newOne,oldOne).replace(newTwo,oldTwo)),baseHash);
});
test('the existing wallet and activity data flow is preserved',()=>{
 for(const part of ['fetch("/api/billing/credits"','setSnapshot(data)','setSnapshot(null)','snapshot.subscriptionAvailableUnits','snapshot.purchasedAvailableUnits','snapshot.reservedUnits','snapshot.activity.map','snapshot.walletFrozen','snapshot.meteringStatus'])assert.ok(file.includes(part),part);
});
test('no checkout or new payment/credit ledger operation is embedded into the balance component',()=>{
 for(const part of ['grantAiCreditLot','stripe.checkout.sessions.create','process.env','NODE_ENV','createPaymentIntent','setPurchasedAvailableUnits'])assert.equal(file.includes(part),false,part);
});
test('copy accurately distinguishes verified sandbox purchases from unavailable paid model spending',()=>{
 assert.match(file,/\$5 Stripe test credit pack can be purchased when the server verifies it/);
 assert.match(file,/metered AI usage remains disabled until model pricing and operations are approved/);
 assert.match(file,/Purchased credits are separate from subscriptions and do not yet enable paid AI usage/);
});
