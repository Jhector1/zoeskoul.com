/**
 * Zoéskoul V12J.6A: READ-ONLY audit of already-received Stripe test events.
 * Never calls Stripe, signs a webhook, posts HTTP, mutates records, or prints IDs/secrets.
 * Source-aligned to the canonical StripeEvent, Subscription, User, FeatureGrant models.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REFERENCE_EVENTS = Object.freeze([
  { id: 'evt_1UTRDmQ7NgL1u0bJ0oK3HiR5', type: 'invoice.paid' },
  { id: 'evt_1UTRDnQ7NgL1u0bJ0lK2m68e', type: 'invoice.payment_succeeded' },
  { id: 'evt_1UTSGNQ7NgL1u0bJQteyDUP9', type: 'checkout.session.completed' },
  { id: 'evt_1UTSGNQ7NgL1u0bJYeTYihMA', type: 'invoice.paid' },
  { id: 'evt_1UTSGOQ7NgL1u0bJOtAJDrW1', type: 'customer.subscription.created' },
  { id: 'evt_1UTSGOQ7NgL1u0bJRKI4tBCC', type: 'invoice.payment_succeeded' },
]);
const AUDIT_APPROVAL = 'V12J6A_READ_ONLY_VERIFIED_DATABASE';
const SAFE_ID = /^[a-zA-Z0-9_.-]{1,100}$/;
const EXPECTED_TABLES = ['User', 'StripeEvent', 'Subscription', 'FeatureGrant'];

export class AuditRefusal extends Error {
  constructor(code) { super(code); this.name = 'AuditRefusal'; }
}

export function maskedEventId(value) {
  if (typeof value !== 'string' || value.length < 12) return 'invalid_event';
  return `evt_…${value.slice(-6)}`;
}
export function selectedAppDatabaseUrl(env = process.env) {
  return env.ADMIN_DATABASE_URL || env.WEB_DATABASE_URL || env.DATABASE_URL;
}
export function configuredPriceSets(env = process.env) {
  const builderRaw = env.ZOEBUILD_AI_STRIPE_PRICE_IDS?.trim() || '';
  const builder = builderRaw ? builderRaw.split(',').map(x => x.trim()) : [];
  const learning = [env.STRIPE_PRICE_MONTHLY_ID, env.STRIPE_PRICE_YEARLY_ID]
    .filter(Boolean).map(x => x.trim());
  for (const price of [...builder, ...learning]) {
    if (!/^price_[A-Za-z0-9_]+$/.test(price)) throw new AuditRefusal('PLATFORM_PRICE_CONFIG_INVALID');
  }
  if (new Set([...builder, ...learning]).size !== builder.length + learning.length) {
    throw new AuditRefusal('PLATFORM_PRICE_CONFIG_DUPLICATE');
  }
  const productRaw = env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS?.trim() || '';
  const products = productRaw ? productRaw.split(',').map(x => x.trim()) : [];
  if (products.some(x => !/^prod_[A-Za-z0-9_]+$/.test(x)) ||
      new Set(products).size !== products.length) {
    throw new AuditRefusal('BUILDER_PRODUCT_CONFIG_INVALID');
  }
  return { builder: new Set(builder), learning: new Set(learning), builderProductsConfigured: products.length > 0 };
}
export function eligibleLocalSubscription(row, prices, now = new Date()) {
  const product = row.billingProduct;
  const catalog = product === 'builder_ai' ? prices.builder : product === 'learning' ? prices.learning : null;
  if (!catalog || !row.customerBindingMatches || !row.priceId || !catalog.has(row.priceId)) return false;
  if (product === 'builder_ai' && !prices.builderProductsConfigured) return false;
  const future = date => date != null && Number.isFinite(new Date(date).getTime()) && new Date(date).getTime() > now.getTime();
  if (row.status === 'trialing') return future(row.trialEnd);
  if (row.status === 'active' || row.status === 'past_due') return future(row.currentPeriodEnd);
  return false;
}
function grantActive(grant, now) {
  return grant.type === 'subscription' && grant.revokedAt == null &&
    (!grant.startsAt || new Date(grant.startsAt).getTime() <= now.getTime()) &&
    (!grant.endsAt || new Date(grant.endsAt).getTime() > now.getTime());
}
export function auditReport({ events, subscriptions, grants, env, now = new Date() }) {
  const prices = configuredPriceSets(env);
  const byEvent = new Map(events.map(row => [row.id, row]));
  const bySub = new Set(subscriptions.map(row => row.stripeSubscriptionId));
  const byCustomer = new Set(subscriptions.map(row => row.stripeCustomerId));
  const lines = [];
  let missing = 0, failed = 0, mismatched = 0, ignored = 0, processed = 0;
  for (const ref of REFERENCE_EVENTS) {
    const row = byEvent.get(ref.id);
    if (!row) {
      lines.push(`EVENT ${maskedEventId(ref.id)} expected=${ref.type} ledger=MISSING`);
      missing++;
      continue;
    }
    const modeMatch = row.livemode === false;
    const typeMatch = row.type === ref.type;
    if (!modeMatch || !typeMatch) mismatched++;
    if (row.status === 'processed') processed++;
    else if (row.status === 'ignored') ignored++;
    else failed++;
    const linkedSub = Boolean(row.subscriptionId && bySub.has(row.subscriptionId));
    const linkedCustomer = Boolean(row.customerId && byCustomer.has(row.customerId));
    lines.push(`EVENT ${maskedEventId(ref.id)} type=${ref.type} ledger=${row.status} ` +
      `testMode=${modeMatch} typeMatches=${typeMatch} attempts=${row.attemptCount} ` +
      `subscriptionRef=${Boolean(row.subscriptionId)} linkedSubscription=${linkedSub} ` +
      `linkedCustomer=${linkedCustomer} ${row.lastError ? 'hasRecordedError=true' : 'hasRecordedError=false'}`);
  }
  const userIds = [...new Set(subscriptions.map(row => row.userId).filter(Boolean))].sort();
  let ownershipMismatch = 0;
  let staleGrantWarning = 0;
  for (const [index, userId] of userIds.entries()) {
    const ownSubs = subscriptions.filter(s => s.userId === userId);
    const userGrants = grants.filter(g => g.userId === userId && grantActive(g, now));
    const localBuilder = ownSubs.some(s => eligibleLocalSubscription(s, prices, now) && s.billingProduct === 'builder_ai');
    const localLearning = ownSubs.some(s => eligibleLocalSubscription(s, prices, now) && s.billingProduct === 'learning');
    const generate = userGrants.some(g => g.feature === 'build_ai_generate');
    const edit = userGrants.some(g => g.feature === 'build_ai_edit');
    if ((generate || edit) && !localBuilder) staleGrantWarning++;
    lines.push(`ACCOUNT #${index + 1} linkedSubscriptions=${ownSubs.length} ` +
      `localBuilderCandidate=${localBuilder} localLearningCandidate=${localLearning} ` +
      `activeBuilderGenerateSubscriptionGrant=${generate} activeBuilderEditSubscriptionGrant=${edit}`);
    for (const s of ownSubs) {
      if (!s.customerBindingMatches) ownershipMismatch++;
      const priceMatches = s.billingProduct === 'builder_ai' ? prices.builder.has(s.priceId) :
        s.billingProduct === 'learning' ? prices.learning.has(s.priceId) : false;
      lines.push(`SUBSCRIPTION account=#${index + 1} product=${s.billingProduct || 'unclassified'} ` +
        `status=${s.status} customerBindingMatches=${s.customerBindingMatches} ` +
        `priceMatchesConfiguredCatalog=${priceMatches} scheduledCancel=${Boolean(s.cancelAtPeriodEnd)} ` +
        `currentPeriodFuture=${Boolean(s.currentPeriodEnd && new Date(s.currentPeriodEnd) > now)} ` +
        `localEligibilityCandidate=${eligibleLocalSubscription(s, prices, now)}`);
    }
  }
  if (userIds.length === 0) lines.push('LOCAL_SUBSCRIPTION_LINKS=NONE (check event references, DB target, or unlinked checkout)');
  const needsReview = missing + failed + mismatched + ownershipMismatch + staleGrantWarning;
  lines.push(`SUMMARY eventsFound=${REFERENCE_EVENTS.length - missing}/${REFERENCE_EVENTS.length} ` +
    `processed=${processed} ignored=${ignored} otherStatus=${failed} ` +
    `linkedSubscriptions=${subscriptions.length} linkedAccounts=${userIds.length} ` +
    `ownerMismatches=${ownershipMismatch} possibleStaleBuilderGrants=${staleGrantWarning} ` +
    `needsReview=${needsReview > 0}`);
  lines.push('SCOPE=DB_ONLY: local eligibility candidates are NOT live Stripe verification or authenticated browser access.');
  return { lines, needsReview: needsReview > 0, counts: { missing, failed, mismatched, ignored, processed, ownershipMismatch } };
}

export async function readAuditWithClient(client, env, { inspect = false } = {}) {
  // All SQL queries execute under a READ ONLY transaction. No mutation is possible.
  await client.query('BEGIN READ ONLY');
  try {
    const identity = (await client.query(`SELECT current_database() AS db, current_user AS db_role,
      current_schema() AS schema, current_setting('transaction_read_only') AS read_only,
      pg_is_in_recovery() AS replica`)).rows[0];
    if (!identity || identity.schema !== 'public' || identity.read_only !== 'on') {
      throw new AuditRefusal('READ_ONLY_SCHEMA_PREFLIGHT_FAILED');
    }
    if (inspect) return { identity };
    if (env.BILLING_EVENT_AUDIT_RUN !== AUDIT_APPROVAL) throw new AuditRefusal('EXPLICIT_READ_ONLY_AUDIT_APPROVAL_REQUIRED');
    if (!SAFE_ID.test(env.BILLING_EVENT_AUDIT_CONFIRMED_DATABASE || '') ||
        !SAFE_ID.test(env.BILLING_EVENT_AUDIT_CONFIRMED_ROLE || '')) {
      throw new AuditRefusal('CONFIRMED_DATABASE_AND_ROLE_REQUIRED');
    }
    if (identity.db !== env.BILLING_EVENT_AUDIT_CONFIRMED_DATABASE ||
        identity.db_role !== env.BILLING_EVENT_AUDIT_CONFIRMED_ROLE) {
      throw new AuditRefusal('AUDIT_DATABASE_IDENTITY_MISMATCH');
    }
    if (!env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      throw new AuditRefusal('STRIPE_TEST_MODE_REQUIRED');
    }
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
      throw new AuditRefusal('WEBHOOK_SIGNING_SECRET_NOT_CONFIGURED');
    }
    const tables = (await client.query(`SELECT
      to_regclass('public."User"') IS NOT NULL AS has_user,
      to_regclass('public."StripeEvent"') IS NOT NULL AS has_event,
      to_regclass('public."Subscription"') IS NOT NULL AS has_subscription,
      to_regclass('public."FeatureGrant"') IS NOT NULL AS has_grant`)).rows[0];
    if (!tables || !tables.has_user || !tables.has_event || !tables.has_subscription || !tables.has_grant) {
      throw new AuditRefusal('CANONICAL_BILLING_TABLES_MISSING');
    }
    const events = (await client.query(`SELECT "id", "type", "livemode", "status", "attemptCount",
      "subscriptionId", "customerId", "lastError"
      FROM public."StripeEvent" WHERE "id" = ANY($1::text[])`,
      [REFERENCE_EVENTS.map(e => e.id)])).rows;
    const subscriptionIds = [...new Set(events.map(e => e.subscriptionId).filter(Boolean))];
    const customerIds = [...new Set(events.map(e => e.customerId).filter(Boolean))];
    const subscriptions = (subscriptionIds.length || customerIds.length) ?
      (await client.query(`SELECT s."stripeSubscriptionId", s."userId", s."stripeCustomerId",
        s."billingProduct", s."priceId", s."status", s."currentPeriodEnd", s."trialEnd",
        s."cancelAtPeriodEnd", (u."stripeCustomerId" = s."stripeCustomerId") AS "customerBindingMatches"
        FROM public."Subscription" s
        LEFT JOIN public."User" u ON u."id" = s."userId"
        WHERE s."stripeSubscriptionId" = ANY($1::text[]) OR s."stripeCustomerId" = ANY($2::text[])
        ORDER BY s."createdAt" DESC LIMIT 101`, [subscriptionIds, customerIds])).rows : [];
    if (subscriptions.length > 100) throw new AuditRefusal('TOO_MANY_LINKED_SUBSCRIPTIONS');
    const userIds = [...new Set(subscriptions.map(s => s.userId).filter(Boolean))];
    const grants = userIds.length ? (await client.query(`SELECT "userId", "feature", "type",
      "startsAt", "endsAt", "revokedAt"
      FROM public."FeatureGrant"
      WHERE "userId" = ANY($1::text[]) AND "type" = 'subscription'
        AND "feature" IN ('build_ai_generate', 'build_ai_edit') LIMIT 201`, [userIds])).rows : [];
    if (grants.length > 200) throw new AuditRefusal('TOO_MANY_LINKED_GRANTS');
    return { identity, report: auditReport({ events, subscriptions, grants, env }) };
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--inspect', '--audit'].includes(args[0])) {
    throw new AuditRefusal('USAGE_INSPECT_OR_AUDIT_REQUIRED');
  }
  const raw = selectedAppDatabaseUrl();
  if (!raw) throw new AuditRefusal('APPLICATION_DATABASE_URL_MISSING');
  let url;
  try { url = new URL(raw); } catch { throw new AuditRefusal('APPLICATION_DATABASE_URL_INVALID'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
    throw new AuditRefusal('APPLICATION_DATABASE_URL_INVALID');
  }
  // Lazy import avoids requiring pg for the pure native unit tests.
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: raw, max: 1, connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 1000, statement_timeout: 12000 });
  try {
    const client = await pool.connect();
    try {
      const result = await readAuditWithClient(client, process.env, { inspect: args[0] === '--inspect' });
      console.log(`BILLING_EVENT_AUDIT_PREFLIGHT_PASS database=${result.identity.db} role=${result.identity.db_role} readOnly=YES replica=${result.identity.replica}`);
      if (result.report) {
        for (const line of result.report.lines) console.log(line);
        if (result.report.needsReview) process.exitCode = 2;
      } else {
        console.log('INSPECTION_ONLY=YES eventRowsRead=NO writes=NO');
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = error instanceof AuditRefusal ? error.message :
      /^(ECONNREFUSED|ETIMEDOUT)$/.test(String(error?.code)) ? String(error.code) : 'DB_AUDIT_QUERY_FAILED';
    console.error(`BILLING_EVENT_AUDIT_REFUSED reason=${code} writes=NO`);
    process.exitCode = 1;
  });
}
