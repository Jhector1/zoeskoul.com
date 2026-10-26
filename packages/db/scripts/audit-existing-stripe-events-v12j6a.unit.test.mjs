import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_EVENTS, AuditRefusal, auditReport, configuredPriceSets,
  eligibleLocalSubscription, maskedEventId, readAuditWithClient,
} from './audit-existing-stripe-events-v12j6a.mjs';

const env = {
  BILLING_EVENT_AUDIT_RUN: 'V12J6A_READ_ONLY_VERIFIED_DATABASE',
  BILLING_EVENT_AUDIT_CONFIRMED_DATABASE: 'learnoir_db',
  BILLING_EVENT_AUDIT_CONFIRMED_ROLE: 'admin',
  LEARNOIR_STRIPE_SECRET_KEY: 'sk_test_not_real',
  STRIPE_WEBHOOK_SECRET: 'whsec_not_real',
  STRIPE_PRICE_MONTHLY_ID: 'price_learning',
  ZOEBUILD_AI_STRIPE_PRICE_IDS: 'price_builder',
  ZOEBUILD_AI_STRIPE_PRODUCT_IDS: 'prod_builder',
};
const date = new Date('2030-01-01T00:00:00.000Z');
const future = new Date('2030-02-01T00:00:00.000Z');
const past = new Date('2029-01-01T00:00:00.000Z');
function fakeClient({ identity = {}, events = [], subscriptions = [], grants = [], tables = {} } = {}) {
  const calls = [];
  const client = {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('current_database()')) return { rows: [{ db: 'learnoir_db', db_role: 'admin', schema: 'public', read_only: 'on', replica: false, ...identity }] };
      if (sql.includes('to_regclass')) return { rows: [{ has_user: true, has_event: true, has_subscription: true, has_grant: true, ...tables }] };
      if (sql.includes('FROM public."StripeEvent"')) return { rows: events };
      if (sql.includes('FROM public."Subscription"')) return { rows: subscriptions };
      if (sql.includes('FROM public."FeatureGrant"')) return { rows: grants };
      throw new Error('unexpected-query');
    },
  };
  return client;
}

test('masks event IDs, never logs raw customer or subscription IDs', () => {
  const id = REFERENCE_EVENTS[0].id;
  assert.equal(maskedEventId(id), `evt_…${id.slice(-6)}`);
  const report = auditReport({
    events: [{ id, type: 'invoice.paid', status: 'processed', livemode: false,
      attemptCount: 1, subscriptionId: 'sub_secret', customerId: 'cus_secret' }],
    subscriptions: [{ stripeSubscriptionId: 'sub_secret', stripeCustomerId: 'cus_secret',
      userId: 'user_secret', status: 'active', billingProduct: 'learning',
      priceId: 'price_learning', currentPeriodEnd: future, customerBindingMatches: true }],
    grants: [], env, now: date,
  });
  assert.ok(report.lines.some(s => s.includes('processed')));
  const output = report.lines.join('\n');
  for (const value of [id, 'sub_secret', 'cus_secret', 'user_secret', 'price_learning']) {
    assert.equal(output.includes(value), false, `leaked ${value}`);
  }
  assert.equal(report.counts.missing, 5);
});

test('read-only audit uses BEGIN READ ONLY and always ROLLBACK, never changes financial records', async () => {
  const client = fakeClient({ events: [{ id: REFERENCE_EVENTS[0].id,
    type: 'invoice.paid', status: 'processed', livemode: false, attemptCount: 1,
    subscriptionId: null, customerId: null }] });
  const result = await readAuditWithClient(client, env);
  assert.equal(result.identity.db, 'learnoir_db');
  assert.equal(result.report.counts.processed, 1);
  assert.equal(client.calls[0].sql, 'BEGIN READ ONLY');
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  for (const { sql } of client.calls) {
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|COMMIT)\b/i);
  }
});

test('inspection requires no approval and reads only database identity', async () => {
  const client = fakeClient();
  const result = await readAuditWithClient(client, {}, { inspect: true });
  assert.equal(result.identity.db_role, 'admin');
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('wrong database or role fails closed and rolls back before event reads', async () => {
  for (const identity of [{ db: 'unknown' }, { db_role: 'wrong' }, { read_only: 'off' }]) {
    const client = fakeClient({ identity });
    await assert.rejects(readAuditWithClient(client, env), AuditRefusal);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(client.calls.some(x => x.sql.includes('FROM public."StripeEvent"')), false);
  }
});

test('refuses production Stripe key and missing explicit audit approval', async () => {
  for (const patch of [{ LEARNOIR_STRIPE_SECRET_KEY: 'sk_live_not_real' }, { BILLING_EVENT_AUDIT_RUN: '' }]) {
    const client = fakeClient();
    await assert.rejects(readAuditWithClient(client, { ...env, ...patch }), AuditRefusal);
    assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
  }
});

test('distinguishes legit ignored events from failed/in-flight ledger states', () => {
  const events = [
    { id: REFERENCE_EVENTS[0].id, type: REFERENCE_EVENTS[0].type, status: 'ignored', livemode: false, attemptCount: 1 },
    { id: REFERENCE_EVENTS[1].id, type: REFERENCE_EVENTS[1].type, status: 'failed', livemode: false, attemptCount: 2 },
  ];
  const report = auditReport({ events, subscriptions: [], grants: [], env, now: date });
  assert.equal(report.counts.ignored, 1);
  assert.equal(report.counts.failed, 1);
  assert.equal(report.counts.missing, 4);
  assert.equal(report.needsReview, true);
});

test('preserves scheduled-cancel access; rejects canceled, expired and mismatched subscriptions', () => {
  const prices = configuredPriceSets(env);
  const row = { billingProduct: 'builder_ai', status: 'active', priceId: 'price_builder',
    customerBindingMatches: true, currentPeriodEnd: future, cancelAtPeriodEnd: true };
  assert.equal(eligibleLocalSubscription(row, prices, date), true);
  assert.equal(eligibleLocalSubscription({ ...row, status: 'canceled' }, prices, date), false);
  assert.equal(eligibleLocalSubscription({ ...row, currentPeriodEnd: past }, prices, date), false);
  assert.equal(eligibleLocalSubscription({ ...row, customerBindingMatches: false }, prices, date), false);
  assert.equal(eligibleLocalSubscription({ ...row, priceId: 'price_other' }, prices, date), false);
});

test('flags active builder grants without a currently eligible builder subscription', () => {
  const report = auditReport({ events: [], subscriptions: [{
    stripeSubscriptionId: 'sub_x', stripeCustomerId: 'cus_x', userId: 'u_x',
    billingProduct: 'builder_ai', priceId: 'price_builder', status: 'canceled',
    currentPeriodEnd: future, customerBindingMatches: true,
  }], grants: [{ userId: 'u_x', type: 'subscription', feature: 'build_ai_generate',
    revokedAt: null, startsAt: past, endsAt: future }], env, now: date });
  assert.ok(report.lines.some(s => s.includes('possibleStaleBuilderGrants=1')));
  assert.equal(report.needsReview, true);
});
