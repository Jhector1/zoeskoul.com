/**
 * V12J.6I: Read-only investigation of Stripe test-mode immediate cancellation.
 * Require the V12J.6C dedicated student approval and a canceled provider subscription.
 * Stripe: GET subscription and bounded GET event-list only.
 * PostgreSQL: BEGIN READ ONLY ... ROLLBACK. Never expose identifiers or payloads.
 */
import { fileURLToPath } from 'node:url';
import { validateCheckArgs, fetchStripeTestSubscription, LifecycleRefusal } from './check-stripe-lifecycle-v12j6c.mjs';

const TYPES = ['customer.subscription.deleted', 'customer.subscription.updated'];
const MAX_PAGES = 4;
const PAGE_SIZE = 100;
const DAYS = 7;
function objectId(x) { return typeof x === 'string' ? x : x?.id; }
function utcTime(x) { return x instanceof Date ? x.toISOString() : null; }
function safeError(e) { return e instanceof LifecycleRefusal ? e.message : 'READ_ONLY_CANCELLATION_AUDIT_UNAVAILABLE'; }
function maskId(s) { return typeof s === 'string' && s.startsWith('evt_') ? `evt_…${s.slice(-6)}` : 'unknown'; }

export async function listRelevantStripeEvents({ subscriptionId, customerId, secret, fetcher = fetch, now = new Date(), maxPages = MAX_PAGES }) {
  if (!secret?.startsWith('sk_test_') || !/^sub_[a-zA-Z0-9_]{5,120}$/.test(subscriptionId)) {
    throw new LifecycleRefusal('STRIPE_TEST_EVENT_SCAN_REFUSED');
  }
  const gte = Math.floor(now.getTime() / 1000) - DAYS * 86400;
  let cursor = null;
  let complete = false;
  let pages = 0;
  let seen = 0;
  const matched = [];
  const ids = new Set();
  for (; pages < maxPages; pages++) {
    const url = new URL('https://api.stripe.com/v1/events');
    url.searchParams.set('types[0]', TYPES[0]);
    url.searchParams.set('types[1]', TYPES[1]);
    url.searchParams.set('created[gte]', String(gte));
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('starting_after', cursor);
    const response = await fetcher(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new LifecycleRefusal(`STRIPE_EVENT_LIST_HTTP_${response.status}`);
    const payload = await response.json();
    if (payload?.object !== 'list' || !Array.isArray(payload.data) || typeof payload.has_more !== 'boolean') {
      throw new LifecycleRefusal('STRIPE_EVENT_LIST_INVALID_RESPONSE');
    }
    for (const e of payload.data) {
      seen++;
      if (!e || e.object !== 'event' || typeof e.id !== 'string' || e.livemode !== false || !TYPES.includes(e.type)) {
        throw new LifecycleRefusal('STRIPE_EVENT_LIST_INVALID_MODE_OR_EVENT');
      }
      const subject = e.data?.object;
      if (subject?.id !== subscriptionId || objectId(subject.customer) !== customerId) continue;
      if (ids.has(e.id)) continue;
      ids.add(e.id);
      matched.push({ id: e.id, type: e.type, created: e.created });
    }
    if (!payload.has_more) { complete = true; pages++; break; }
    if (!payload.data.length || typeof payload.data.at(-1)?.id !== 'string') {
      throw new LifecycleRefusal('STRIPE_EVENT_PAGINATION_INVALID');
    }
    cursor = payload.data.at(-1).id;
  }
  return { matched, complete, pages, scanned: seen, windowDays: DAYS };
}

export function classifyCancellation({ stripe, rows, grants, ledger, now = new Date() }) {
  const exact = stripe.matched.filter(e => e.type === 'customer.subscription.deleted');
  const exactStates = exact.map(e => ({ event: e, db: ledger.find(l => l.id === e.id) ?? null }));
  const deletedProcessed = exactStates.some(e => e.db?.status === 'processed');
  const failed = exactStates.some(e => e.db?.status === 'failed');
  const ignored = exactStates.some(e => e.db?.status === 'ignored');
  const processing = exactStates.some(e => e.db?.status === 'processing');
  const missing = exactStates.some(e => !e.db);
  const dbCanceled = rows.length === 1 && rows[0].status === 'canceled';
  const t = now.getTime();
  const liveGrants = grants.filter(g => g.revokedAt === null &&
    (!g.startsAt || new Date(g.startsAt).getTime() <= t) &&
    (!g.endsAt || new Date(g.endsAt).getTime() > t));
  let next;
  if (deletedProcessed && (!dbCanceled || liveGrants.length)) next = 'PROCESSED_DELETION_BUT_DATABASE_STATE_STALE';
  else if (failed) next = 'DELETION_LEDGER_FAILED_CHECK_WEB_SERVER_LOG';
  else if (ignored) next = 'DELETION_LEDGER_IGNORED_CHECK_MAPPING';
  else if (processing) next = 'DELETION_STILL_PROCESSING_CHECK_WEB_SERVER_LOG';
  else if (missing) next = 'STRIPE_DELETION_EVENT_MISSING_LOCALLY_CHECK_FORWARDER';
  else if (!exact.length && stripe.complete) next = 'NO_MATCHING_DELETION_EVENT_IN_SEVEN_DAY_STRIPE_WINDOW';
  else if (!exact.length) next = 'EVENT_SCAN_INCOMPLETE_CANNOT_RULE_OUT_DELETION';
  else if (dbCanceled && liveGrants.length === 0) next = 'RECONCILIATION_COMPLETE';
  else next = 'REVIEW_CANCELLATION_DELIVERY';
  return { next, localStatus: rows[0]?.status ?? 'missing', activeGrantCount: liveGrants.length,
    stripeDeletionEvents: exact.length, stripeUpdatedEvents: stripe.matched.filter(x => x.type === TYPES[1]).length,
    deletedProcessed, failed, ignored, processing, missing, scanComplete: stripe.complete,
    eventOutcomes: exactStates.map(({event,db}) => ({ eventIdMasked: maskId(event.id), ledger: db?.status ?? 'missing',
      attemptCount: db?.attemptCount ?? null, hasRecordedError: Boolean(db?.lastError),
      processedAt: utcTime(db?.processedAt) })),
  };
}

export async function auditCancellationWithDb(client, env, { args = ['--audit'], fetcher = fetch, now = new Date() } = {}) {
  if (args.length !== 1 || args[0] !== '--audit') throw new LifecycleRefusal('USAGE_AUDIT_ONLY');
  const config = validateCheckArgs(env, ['--check', 'builder_ai', 'canceled']);
  await client.query('BEGIN READ ONLY');
  try {
    const identity = (await client.query(`SELECT current_database() AS db, current_user AS role,
      current_schema() AS schema, current_setting('transaction_read_only') AS read_only`)).rows[0];
    if (!identity || identity.schema !== 'public' || identity.read_only !== 'on' ||
        identity.db !== env.BILLING_LIFECYCLE_CONFIRMED_DATABASE || identity.role !== env.BILLING_LIFECYCLE_CONFIRMED_ROLE) {
      throw new LifecycleRefusal('DATABASE_IDENTITY_MISMATCH');
    }
    const users = (await client.query(`SELECT "id", "email", "roles"::text[] AS "roles", "stripeCustomerId"
      FROM public."User" WHERE lower("email")=$1 LIMIT 2`, [config.email])).rows;
    if (users.length !== 1 || users[0].roles?.length !== 1 || users[0].roles[0] !== 'student' || !users[0].stripeCustomerId) {
      throw new LifecycleRefusal('DEDICATED_STUDENT_OWNER_NOT_FOUND');
    }
    const user = users[0];
    const remote = await fetchStripeTestSubscription(config.subscriptionId, env.LEARNOIR_STRIPE_SECRET_KEY, fetcher);
    const customer = objectId(remote.customer);
    if (customer !== user.stripeCustomerId || (remote.metadata?.userId && remote.metadata.userId !== user.id)) {
      throw new LifecycleRefusal('FOREIGN_STRIPE_SUBSCRIPTION_REFUSED');
    }
    if (remote.status !== 'canceled') throw new LifecycleRefusal('STRIPE_SUBSCRIPTION_NOT_CANCELED');
    const rows = (await client.query(`SELECT "userId", "stripeCustomerId", "status", "billingProduct"
      FROM public."Subscription" WHERE "stripeSubscriptionId"=$1`, [config.subscriptionId])).rows;
    if (rows.length !== 1 || rows[0].userId !== user.id || rows[0].stripeCustomerId !== customer || rows[0].billingProduct !== 'builder_ai') {
      throw new LifecycleRefusal('LOCAL_BUILDER_SUBSCRIPTION_OWNER_MISMATCH');
    }
    const grants = (await client.query(`SELECT "feature"::text AS "feature",
      ("startsAt" AT TIME ZONE 'UTC') AS "startsAt", ("endsAt" AT TIME ZONE 'UTC') AS "endsAt",
      ("revokedAt" AT TIME ZONE 'UTC') AS "revokedAt"
      FROM public."FeatureGrant" WHERE "userId"=$1 AND "type"='subscription'
      AND "feature" IN ('build_ai_generate','build_ai_edit') LIMIT 100`, [user.id])).rows;
    const stripe = await listRelevantStripeEvents({ subscriptionId: config.subscriptionId, customerId: customer,
      secret: env.LEARNOIR_STRIPE_SECRET_KEY, fetcher, now });
    const ids = stripe.matched.map(e => e.id);
    const ledger = ids.length ? (await client.query(`SELECT "id", "type", "status", "attemptCount", "lastError",
      ("processedAt" AT TIME ZONE 'UTC') AS "processedAt"
      FROM public."StripeEvent" WHERE "id"=ANY($1::text[])`, [ids])).rows : [];
    // Exact event IDs permit distinguishing delivery from reconciliation without
    // depending on approximate local event timestamps or disclosing secrets.
    return { identity, facts: classifyCancellation({stripe,rows,grants,ledger,now}), stripeScan: {
      pages:stripe.pages, seen:stripe.scanned, complete:stripe.complete, windowDays:stripe.windowDays,
    }};
  } finally { await client.query('ROLLBACK'); }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== '--audit') throw new LifecycleRefusal('USAGE_AUDIT_ONLY');
  validateCheckArgs(process.env, ['--check', 'builder_ai', 'canceled']);
  const uri = process.env.ADMIN_DATABASE_URL || process.env.WEB_DATABASE_URL || process.env.DATABASE_URL;
  let url;
  try { url = new URL(uri); } catch { throw new LifecycleRefusal('POSTGRES_URL_INVALID'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname === '/') throw new LifecycleRefusal('POSTGRES_URL_INVALID');
  const { Pool } = await import('pg');
  const pool = new Pool({connectionString:uri,max:1,connectionTimeoutMillis:7000,statement_timeout:25000});
  try {
    const client = await pool.connect();
    try {
      const result = await auditCancellationWithDb(client,process.env,{args});
      console.log(`V12J6I_PREFLIGHT_PASS database=${result.identity.db} role=${result.identity.role} readOnly=YES`);
      console.log('stripeStatus=canceled');
      for (const [key,value] of Object.entries(result.facts)) {
        if (key !== 'eventOutcomes') console.log(`${key}=${value}`);
      }
      console.log(`stripeScan=${JSON.stringify(result.stripeScan)}`);
      for (const e of result.facts.eventOutcomes) console.log(`DELETION_EVENT ${JSON.stringify(e)}`);
      console.log('V12J6I_AUDIT_DONE stripe=GET_ONLY postgres=READ_ONLY changes=NO');
      if (result.facts.next !== 'RECONCILIATION_COMPLETE') process.exitCode=1;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(e => { console.error(`V12J6I_REFUSED ${safeError(e)}`); process.exitCode=1; });
}
