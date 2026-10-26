/**
 * V12J.6C: READ-ONLY lifecycle checkpoint for a dedicated non-exempt Stripe test account.
 * Compares a live Stripe GET to canonical PostgreSQL records under BEGIN READ ONLY.
 * No Stripe writes, no application POST, no DB mutation, no personal identifiers in output.
 * Use Stripe test-mode Dashboard/customer portal to perform transitions OUTSIDE this script.
 */
import { fileURLToPath } from 'node:url';

const APPROVAL = 'V12J6C_READ_ONLY_DEDICATED_TEST_ACCOUNT';
const STAGES = new Set(['active', 'scheduled', 'resumed', 'canceled']);
const PRODUCTS = new Set(['builder_ai', 'learning']);
const SUB_PATTERN = /^sub_[a-zA-Z0-9_]{5,120}$/;
const DB_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,100}$/;

export class LifecycleRefusal extends Error {
  constructor(code) { super(code); this.name = 'LifecycleRefusal'; }
}
export function validateDedicatedEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const match = /^([^\s@]+)@([^\s@]+)$/.exec(email);
  // Never use the production account simply because it belongs to the caller.
  if (!match || !/(?:billing[-_.+]?test|v12j6c)/i.test(match[1])) {
    throw new LifecycleRefusal('DEDICATED_BILLING_TEST_EMAIL_REQUIRED');
  }
  return email;
}
export function platformPriceSets(env) {
  const monthly = env.STRIPE_PRICE_MONTHLY_ID?.trim();
  const yearly = env.STRIPE_PRICE_YEARLY_ID?.trim();
  const builder = (env.ZOEBUILD_AI_STRIPE_PRICE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const all = [monthly, yearly, ...builder].filter(Boolean);
  if (all.some(v => !/^price_[a-zA-Z0-9_]+$/.test(v)) || new Set(all).size !== all.length) {
    throw new LifecycleRefusal('INVALID_PLATFORM_PRICE_CATALOG');
  }
  const builderProducts = (env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (builderProducts.some(p => !/^prod_[a-zA-Z0-9_]+$/.test(p))) {
    throw new LifecycleRefusal('INVALID_BUILDER_PRODUCT_CATALOG');
  }
  return { learning: new Set([monthly, yearly].filter(Boolean)), builder_ai: new Set(builder),
    builderProducts: new Set(builderProducts) };
}
export function validateCheckArgs(env, args) {
  const [mode, product, stage] = args;
  if (mode !== '--check' || args.length !== 3 || !PRODUCTS.has(product) || !STAGES.has(stage)) {
    throw new LifecycleRefusal('USAGE_CHECK_PRODUCT_STAGE_REQUIRED');
  }
  if (env.BILLING_LIFECYCLE_APPROVAL !== APPROVAL) {
    throw new LifecycleRefusal('EXPLICIT_READ_ONLY_LIFECYCLE_APPROVAL_REQUIRED');
  }
  if (!env.LEARNOIR_STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    throw new LifecycleRefusal('LIVE_STRIPE_KEY_FORBIDDEN_TEST_KEY_REQUIRED');
  }
  if (!DB_NAME_PATTERN.test(env.BILLING_LIFECYCLE_CONFIRMED_DATABASE || '') ||
      !DB_NAME_PATTERN.test(env.BILLING_LIFECYCLE_CONFIRMED_ROLE || '')) {
    throw new LifecycleRefusal('EXPLICIT_DATABASE_IDENTITY_REQUIRED');
  }
  if (!SUB_PATTERN.test(env.BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID || '')) {
    throw new LifecycleRefusal('EXACT_STRIPE_TEST_SUBSCRIPTION_ID_REQUIRED');
  }
  const email = validateDedicatedEmail(env.BILLING_LIFECYCLE_TEST_EMAIL);
  const prices = platformPriceSets(env);
  if (!prices[product].size || (product === 'builder_ai' && !prices.builderProducts.size)) {
    throw new LifecycleRefusal('PRODUCT_CATALOG_NOT_CONFIGURED');
  }
  return { product, stage, email, subscriptionId: env.BILLING_LIFECYCLE_TEST_SUBSCRIPTION_ID, prices };
}
export async function fetchStripeTestSubscription(subscriptionId, secret, fetcher = fetch) {
  if (!SUB_PATTERN.test(subscriptionId) || !secret?.startsWith('sk_test_')) {
    throw new LifecycleRefusal('STRIPE_READ_REFUSED');
  }
  // The ONLY provider operation is retrieving one subscription over GET.
  const response = await fetcher(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new LifecycleRefusal(`STRIPE_SUBSCRIPTION_GET_HTTP_${response.status}`);
  const data = await response.json();
  if (data?.object !== 'subscription' || data?.id !== subscriptionId || data?.livemode !== false) {
    throw new LifecycleRefusal('STRIPE_TEST_SUBSCRIPTION_ID_OR_MODE_MISMATCH');
  }
  return data;
}
function remoteCustomerId(remote) {
  return typeof remote.customer === 'string' ? remote.customer : remote.customer?.id;
}
function toDateSeconds(seconds) {
  return typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}
function remotePeriodEnd(remote) {
  const ends = (remote.items?.data || []).map(item => item.current_period_end).filter(x => typeof x === 'number');
  return ends.length === 1 ? toDateSeconds(ends[0]) : null;
}
function currentGrant(grant, nowMs) {
  return grant.type === 'subscription' && grant.revokedAt === null &&
    (!grant.startsAt || new Date(grant.startsAt).getTime() <= nowMs) &&
    (!grant.endsAt || new Date(grant.endsAt).getTime() > nowMs);
}
/**
 * V12J.7B acceptance-only projection of the same stored subscription eligibility
 * windows used by Learning. Cross-product evidence must remain independent:
 * a canceled Builder plan does not become entitled when Learning is purchased.
 * This is read-only diagnostics; the Web entitlement owner remains authoritative.
 */
function locallyEntitled(row, nowMs) {
  const end = row?.status === 'trialing' ? row?.trialEnd : row?.currentPeriodEnd;
  const endMs = end ? new Date(end).getTime() : NaN;
  return Number.isFinite(endMs) && endMs > nowMs &&
    (row?.status === 'trialing' || row?.status === 'active' || row?.status === 'past_due');
}
export function evaluateLearningIsolation({ stage, subscriptionId, user, subscriptions, grants, prices, now = new Date() }) {
  const currentTime = now.getTime();
  const owned = subscriptions.filter(row => row.userId === user.id &&
    row.stripeCustomerId === user.stripeCustomerId);
  const learning = owned.filter(row => row.billingProduct === 'learning' &&
    prices.learning.has(row.priceId) && locallyEntitled(row, currentTime));
  const builder = owned.filter(row => row.billingProduct === 'builder_ai' &&
    prices.builder_ai.has(row.priceId) && locallyEntitled(row, currentTime));
  const targetLearningEligible = learning.some(row => row.stripeSubscriptionId === subscriptionId);
  const otherCurrentLearningSubscriptions = learning.filter(row => row.stripeSubscriptionId !== subscriptionId).length;
  const activeBuilderSubscriptionGrants = grants.filter(grant =>
    ['build_ai_generate', 'build_ai_edit'].includes(grant.feature) && currentGrant(grant, currentTime)).length;
  const problems = [];
  if (stage === 'canceled') {
    if (targetLearningEligible) problems.push('CANCELED_LEARNING_TARGET_STILL_ELIGIBLE');
    if (otherCurrentLearningSubscriptions > 0) problems.push('OTHER_ACTIVE_LEARNING_SUBSCRIPTION_PREVENTS_ACCESS_DENIAL_TEST');
  } else if (!targetLearningEligible) {
    problems.push('LEARNING_ENTITLEMENT_NOT_ACTIVE_AFTER_RECONCILIATION');
  }
  if (builder.length === 0 && activeBuilderSubscriptionGrants > 0) {
    problems.push('BUILDER_GRANTS_PRESENT_WITHOUT_ELIGIBLE_BUILDER_PLAN');
  }
  return { problems, facts: {
    learningAccessFromDb: learning.length > 0,
    targetLearningEligible,
    otherCurrentLearningSubscriptions,
    builderAccessFromDb: builder.length > 0,
    activeBuilderSubscriptionGrantCount: activeBuilderSubscriptionGrants,
  }};
}
export function evaluateLifecycle({ product, stage, email, subscriptionId, prices, user, rows, grants, events, remote, now = new Date() }) {
  const problems = [];
  const requireCondition = (ok, error) => { if (!ok) problems.push(error); };
  const customer = remoteCustomerId(remote);
  const row = rows.find(s => s.stripeSubscriptionId === subscriptionId);
  const items = remote.items?.data || [];
  const remotePrice = items.length === 1 ? items[0]?.price : null;
  const priceId = typeof remotePrice === 'string' ? remotePrice : remotePrice?.id;
  const priceProduct = typeof remotePrice?.product === 'string' ? remotePrice.product : remotePrice?.product?.id;
  const periodEnd = remotePeriodEnd(remote);
  const validPeriod = periodEnd && periodEnd.getTime() > now.getTime();
  requireCondition(Boolean(user) && String(user.email).toLowerCase() === email, 'ACCOUNT_NOT_FOUND_OR_WRONG_EMAIL');
  requireCondition(Array.isArray(user?.roles) && user.roles.length === 1 && user.roles[0] === 'student',
    'ACCOUNT_IS_NOT_NONEXEMPT_STUDENT');
  requireCondition(Boolean(customer) && user?.stripeCustomerId === customer, 'CUSTOMER_OWNERSHIP_MISMATCH');
  requireCondition(!remote.metadata?.userId || remote.metadata.userId === user?.id, 'STRIPE_METADATA_OWNER_MISMATCH');
  requireCondition(!remote.metadata?.billingProduct || remote.metadata.billingProduct === product, 'STRIPE_PRODUCT_HINT_MISMATCH');
  requireCondition(items.length === 1 && Boolean(priceId) && prices[product].has(priceId), 'STRIPE_PRICE_NOT_IN_PRODUCT_CATALOG');
  if (product === 'builder_ai') {
    requireCondition(Boolean(priceProduct) && prices.builderProducts.has(priceProduct), 'STRIPE_BUILDER_PRODUCT_MISMATCH');
  }
  requireCondition(Boolean(row), 'SUBSCRIPTION_NOT_RECONCILED_IN_POSTGRES');
  requireCondition(row?.userId === user?.id && row?.stripeCustomerId === customer, 'LOCAL_SUBSCRIPTION_OWNER_MISMATCH');
  requireCondition(row?.billingProduct === product && row?.priceId === priceId, 'LOCAL_BILLING_PRODUCT_OR_PRICE_MISMATCH');
  requireCondition(row?.status === remote.status, 'LOCAL_STRIPE_STATUS_MISMATCH');
  requireCondition(row?.cancelAtPeriodEnd === Boolean(remote.cancel_at_period_end), 'LOCAL_CANCEL_FLAG_MISMATCH');
  if (periodEnd) {
    const dbTime = row?.currentPeriodEnd && new Date(row.currentPeriodEnd).getTime();
    requireCondition(typeof dbTime === 'number' && Math.abs(dbTime - periodEnd.getTime()) <= 2000,
      'LOCAL_BILLING_PERIOD_MISMATCH');
  } else if (stage !== 'canceled') problems.push('STRIPE_PERIOD_END_MISSING');
  const lastTransition = events.find(e => ['customer.subscription.created', 'customer.subscription.updated',
    'customer.subscription.resumed', 'customer.subscription.deleted'].includes(e.type));
  requireCondition(Boolean(lastTransition) && lastTransition.status === 'processed' && lastTransition.livemode === false,
    'LATEST_SUBSCRIPTION_WEBHOOK_NOT_PROCESSED');
  if (stage === 'active') {
    requireCondition(lastTransition && ['customer.subscription.created', 'customer.subscription.updated'].includes(lastTransition.type),
      'ACTIVATION_EVENT_NOT_FOUND');
  } else if (stage === 'scheduled' || stage === 'resumed') {
    requireCondition(lastTransition?.type === 'customer.subscription.updated' ||
      lastTransition?.type === 'customer.subscription.resumed', 'CANCELLATION_CHANGE_EVENT_NOT_FOUND');
  } else {
    requireCondition(lastTransition?.type === 'customer.subscription.deleted', 'CANCELLATION_EVENT_NOT_FOUND');
  }
  const active = stage !== 'canceled';
  if (active) {
    requireCondition(['active', 'trialing'].includes(remote.status), 'STRIPE_SUBSCRIPTION_NOT_ACTIVE');
    requireCondition(Boolean(validPeriod), 'STRIPE_BILLING_PERIOD_EXPIRED');
    requireCondition(['active', 'trialing'].includes(row?.status), 'POSTGRES_SUBSCRIPTION_NOT_ACTIVE');
  } else {
    requireCondition(remote.status === 'canceled' && row?.status === 'canceled', 'CANCELLATION_NOT_TERMINAL');
  }
  if (stage === 'scheduled') {
    requireCondition(remote.cancel_at_period_end === true && row?.cancelAtPeriodEnd === true,
      'SCHEDULED_CANCELLATION_NOT_SET');
    requireCondition(typeof remote.cancel_at === 'number', 'SCHEDULED_CANCELLATION_DATE_MISSING');
  } else {
    requireCondition(remote.cancel_at_period_end === false && row?.cancelAtPeriodEnd === false,
      'CANCELLATION_FLAG_NOT_CLEARED');
  }
  const activeBuilderGrants = grants.filter(g =>
    ['build_ai_generate', 'build_ai_edit'].includes(g.feature) && currentGrant(g, now.getTime()));
  const grantFeatures = new Set(activeBuilderGrants.map(g => g.feature));
  if (product === 'builder_ai') {
    for (const feature of ['build_ai_generate', 'build_ai_edit']) {
      requireCondition(grantFeatures.has(feature) === active, `BUILDER_${feature.toUpperCase()}_GRANT_MISMATCH`);
    }
  }
  return {
    passed: problems.length === 0,
    problems,
    facts: {
      product, stage, stripeStatus: remote.status,
      databaseStatus: row?.status ?? 'missing', cancelAtPeriodEnd: Boolean(remote.cancel_at_period_end),
      billingPeriodFuture: Boolean(validPeriod), localOwnershipMatches: Boolean(user && row && row.userId === user.id && row.stripeCustomerId === customer),
      webhookOutcome: lastTransition?.status ?? 'missing',
      webhookType: lastTransition?.type ?? 'missing',
      builderGenerateGrant: grantFeatures.has('build_ai_generate'),
      builderEditGrant: grantFeatures.has('build_ai_edit'),
      roleExempt: !(Array.isArray(user?.roles) && user.roles.length === 1 && user.roles[0] === 'student'),
    },
  };
}
export async function checkWithDb(client, env, { inspect = false, args, fetcher } = {}) {
  await client.query('BEGIN READ ONLY');
  try {
    const identity = (await client.query(`SELECT current_database() AS db, current_user AS role,
      current_schema() AS schema, current_setting('transaction_read_only') AS read_only,
      pg_is_in_recovery() AS replica`)).rows[0];
    if (!identity || identity.read_only !== 'on' || identity.schema !== 'public') {
      throw new LifecycleRefusal('DATABASE_READ_ONLY_PREFLIGHT_FAILED');
    }
    if (inspect) return { identity };
    const config = validateCheckArgs(env, args);
    if (identity.db !== env.BILLING_LIFECYCLE_CONFIRMED_DATABASE ||
      identity.role !== env.BILLING_LIFECYCLE_CONFIRMED_ROLE) {
      throw new LifecycleRefusal('DATABASE_IDENTITY_MISMATCH');
    }
    // User.roles is a PostgreSQL UserRole[] enum array. Cast to text[] so
    // node-postgres uses its built-in array parser, not an unknown enum-array
    // OID that may be returned as the raw string "{student}".
    const user = (await client.query(`SELECT "id", "email", "roles"::text[] AS "roles", "stripeCustomerId"
      FROM public."User" WHERE lower("email") = $1 LIMIT 2`, [config.email])).rows;
    if (user.length !== 1) throw new LifecycleRefusal('DEDICATED_ACCOUNT_NOT_FOUND_OR_AMBIGUOUS');
    const owner = user[0];
    if (!Array.isArray(owner.roles) || owner.roles.length !== 1 || owner.roles[0] !== 'student') {
      throw new LifecycleRefusal('NONEXEMPT_STUDENT_ACCOUNT_REQUIRED');
    }
    if (!owner.stripeCustomerId) throw new LifecycleRefusal('DEDICATED_STRIPE_CUSTOMER_NOT_LINKED');
    const remote = await fetchStripeTestSubscription(config.subscriptionId, env.LEARNOIR_STRIPE_SECRET_KEY, fetcher);
    if (remoteCustomerId(remote) !== owner.stripeCustomerId ||
      (remote.metadata?.userId && remote.metadata.userId !== owner.id)) {
      throw new LifecycleRefusal('FOREIGN_STRIPE_SUBSCRIPTION_REFUSED');
    }
    // Prisma stores DateTime as PostgreSQL timestamp(3) WITHOUT TIME ZONE.
    // node-postgres otherwise treats the naive clock as the local timezone,
    // shifting Stripe period dates (5h in CDT, 6h in CST). Interpret as UTC.
    const rows = (await client.query(`SELECT "userId", "stripeSubscriptionId", "stripeCustomerId",
      "billingProduct", "priceId", "status", "cancelAtPeriodEnd",
      ("currentPeriodEnd" AT TIME ZONE 'UTC') AS "currentPeriodEnd",
      ("trialEnd" AT TIME ZONE 'UTC') AS "trialEnd"
      FROM public."Subscription" WHERE "stripeSubscriptionId" = $1`, [config.subscriptionId])).rows;
    const grants = (await client.query(`SELECT "feature", "type",
      ("revokedAt" AT TIME ZONE 'UTC') AS "revokedAt",
      ("startsAt" AT TIME ZONE 'UTC') AS "startsAt",
      ("endsAt" AT TIME ZONE 'UTC') AS "endsAt"
      FROM public."FeatureGrant" WHERE "userId" = $1 AND "type" = 'subscription'
      AND "feature" IN ('build_ai_generate', 'build_ai_edit') LIMIT 101`, [owner.id])).rows;
    if (grants.length > 100) throw new LifecycleRefusal('TOO_MANY_BUILDER_GRANTS');
    const events = (await client.query(`SELECT "type", "status", "livemode",
      ("receivedAt" AT TIME ZONE 'UTC') AS "receivedAt"
      FROM public."StripeEvent" WHERE "subscriptionId" = $1
      ORDER BY "receivedAt" DESC, "created" DESC LIMIT 30`, [config.subscriptionId])).rows;
    const lifecycle = evaluateLifecycle({ ...config, user: owner, rows, grants, events, remote });
    if (config.product === 'learning') {
      // Query all local subscriptions for this one authorized test user so that
      // canceled access cannot appear revoked while another paid Learning plan
      // is still active. The normal Web entitlement reader remains unchanged.
      const subscriptions = (await client.query(`SELECT "userId", "stripeCustomerId", "stripeSubscriptionId",
        "billingProduct", "priceId", "status",
        ("currentPeriodEnd" AT TIME ZONE 'UTC') AS "currentPeriodEnd",
        ("trialEnd" AT TIME ZONE 'UTC') AS "trialEnd"
        FROM public."Subscription" WHERE "userId" = $1
        ORDER BY "updatedAt" DESC LIMIT 101`, [owner.id])).rows;
      if (subscriptions.length > 100) throw new LifecycleRefusal('TOO_MANY_LOCAL_SUBSCRIPTIONS_FOR_LEARNING_AUDIT');
      const isolation = evaluateLearningIsolation({ ...config, user: owner, subscriptions, grants });
      lifecycle.problems.push(...isolation.problems);
      lifecycle.passed = lifecycle.problems.length === 0;
      Object.assign(lifecycle.facts, isolation.facts);
    }
    return { identity, result: lifecycle };
  } finally {
    await client.query('ROLLBACK');
  }
}
function safeFailure(error) {
  if (error instanceof LifecycleRefusal) return error.message;
  return 'LIFECYCLE_CHECK_UNAVAILABLE';
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 && args.length !== 3) throw new LifecycleRefusal('USAGE_INSPECT_OR_CHECK_PRODUCT_STAGE');
  if (args.length === 1 && args[0] !== '--inspect') throw new LifecycleRefusal('USAGE_INSPECT_OR_CHECK_PRODUCT_STAGE');
  if (args.length === 3 && args[0] !== '--check') throw new LifecycleRefusal('USAGE_INSPECT_OR_CHECK_PRODUCT_STAGE');
  const env = process.env;
  // Validate BEFORE opening DB/performing Stripe network access for checkpoint requests.
  if (args[0] === '--check') validateCheckArgs(env, args);
  const uri = env.ADMIN_DATABASE_URL || env.WEB_DATABASE_URL || env.DATABASE_URL;
  let url;
  try { url = new URL(uri); } catch { throw new LifecycleRefusal('APPLICATION_DATABASE_URL_MISSING_OR_INVALID'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname === '/') {
    throw new LifecycleRefusal('POSTGRES_CONNECTION_REQUIRED');
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: uri, max: 1, connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 1000, statement_timeout: 20000 });
  try {
    const client = await pool.connect();
    try {
      const { identity, result } = await checkWithDb(client, env, { inspect: args[0] === '--inspect', args });
      console.log(`BILLING_LIFECYCLE_PREFLIGHT_PASS database=${identity.db} role=${identity.role} readOnly=YES`);
      if (args[0] === '--inspect') {
        console.log('INSPECTION_ONLY=YES stripeCalls=NO accountReads=NO writes=NO');
        return;
      }
      for (const [key, value] of Object.entries(result.facts)) console.log(`${key}=${value}`);
      if (!result.passed) {
        for (const code of result.problems) console.log(`REVIEW ${code}`);
        process.exitCode = 1;
        console.log('V12J6C_CHECKPOINT_REVIEW liveStripe=GET postgres=READ_ONLY changes=NO');
      } else {
        console.log('V12J6C_CHECKPOINT_PASS liveStripe=GET postgres=READ_ONLY changes=NO');
      }
      console.log('BROWSER_GATE=SEPARATE: confirm account session and UI status in both applications.');
    } finally { client.release(); }
  } finally { await pool.end(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(`V12J6C_REFUSED ${safeFailure(error)}`); process.exitCode = 1; });
}
