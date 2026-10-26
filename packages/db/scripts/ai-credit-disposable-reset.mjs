/**
 * Operator-only test-data reset; NOT a runtime billing alternative.
 * Preview is default. Apply needs exact DB identity, a current snapshot digest,
 * an independent disposable-data attestation and the application stopped.
 * NEVER deletes StripeEvent, User, Subscription, FeatureGrant, BuildProject,
 * ZoeBuildChatMessage, or any learning/domain data.
 */
import pg from 'pg';
import { CREDIT_TABLES, ATTEST, CONFIRM, RISK_TEST_ATTEST, NO_LIVE_FUNDS_ATTEST, readFlag, assertTarget,
  assertApplyAuthorization, assertDisposableSignals, snapshotFingerprint } from './ai-credit-disposable-reset-policy.mjs';

const argv = process.argv.slice(2);
function help() {
  console.log('USAGE: node --env-file=.env.shared.local packages/db/scripts/ai-credit-disposable-reset.mjs --preview|--apply --expect-host localhost --expect-database DATABASE --expect-schema public [apply safety flags; --attest-test-only-risk and --attest-no-live-funds required if payment-risk rows exist]');
}
async function run() {
  if (argv.includes('--help')) { help(); return; }
  const apply = argv.includes('--apply');
  if (apply === argv.includes('--preview')) throw Error('CHOOSE_EXACTLY_ONE_MODE');
  // Parse/validate BEFORE making a database connection.
  const target = assertTarget({url:process.env.DATABASE_URL,
    expectedHost:readFlag(argv,'--expect-host'), expectedDatabase:readFlag(argv,'--expect-database'),
    expectedSchema:readFlag(argv,'--expect-schema')});
  if (apply && (readFlag(argv,'--attest')!==ATTEST || readFlag(argv,'--confirm')!==CONFIRM ||
      !argv.includes('--application-stopped') || !/^[a-f0-9]{64}$/.test(readFlag(argv,'--fingerprint')||'')))
    throw Error('APPLY_AUTHORIZATION_INCOMPLETE');
  const client = new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  await client.connect();
  let inTransaction = false;
  try {
    await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN TRANSACTION READ ONLY');
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    if (apply) {
      // Lock all source tables and StripeEvent before checking snapshot. New
      // writes cannot change the inspected dataset during the reset.
      const locks = [...CREDIT_TABLES, 'StripeEvent'].map(t=>`"${t}"`).join(', ');
      await client.query(`LOCK TABLE ${locks} IN ACCESS EXCLUSIVE MODE`);
    }
    const identityQuery = await client.query('SELECT current_database() AS database, current_schema() AS schema');
    const identity = identityQuery.rows[0];
    if (identity.database!==target.database || identity.schema!==target.schema) throw Error('CONNECTED_DATABASE_MISMATCH');
    const signals = await client.query(`SELECT COUNT(*) FILTER (WHERE livemode)::int AS live FROM "StripeEvent"`);
    const liveStripeEvents = signals.rows[0].live;
    // Never run a bulk reset in a database with payment-risk history: this is
    // insufficient evidence of disposable data, even if webhook rows are missing.
    const risk = await client.query('SELECT (SELECT COUNT(*) FROM "AiCreditPaymentRiskEvent")::int + (SELECT COUNT(*) FROM "AiCreditPaymentReversalSnapshot")::int AS n');
    const nonTestSignal = risk.rows[0].n;
    const rows=[];
    for (const table of CREDIT_TABLES) {
      const count = await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      if (!Number.isSafeInteger(count.rows[0].n) || count.rows[0].n>10000)
        throw Error('DATASET_TOO_LARGE_FOR_DISPOSABLE_RESET');
      // Full-row digests ensure the apply re-check detects a changed amount,
      // status, or provider receipt, not just a changed row count.
      const digest = await client.query(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY row_to_json(t)::text), '')) AS digest FROM "${table}" t`);
      rows.push({table,count:count.rows[0].n,digest:digest.rows[0].digest});
    }
    const fingerprint = snapshotFingerprint({identity,rows,liveStripeEvents,nonTestSignal});
    console.log('=== DISPOSABLE AI CREDIT DOMAIN ===');
    console.log(`MODE=${apply?'APPLY':'PREVIEW'}`);
    console.log(`DATABASE=${identity.database} SCHEMA=${identity.schema} HOST=${target.host}`);
    for(const row of rows) console.log(`${row.table}=${row.count}`);
    console.log(`LIVE_STRIPE_EVENTS=${liveStripeEvents} PAYMENT_RISK_OR_REVERSAL_RECORDS=${nonTestSignal}`);
    console.log('PAYMENT_RISK_ROWS_ARE_NOT_PROOF_OF_LIVE_MODE=YES');
    console.log(`SNAPSHOT_FINGERPRINT=${fingerprint}`);
    console.log('STRIPE_EVENT_LEDGER=PRESERVED USER_PROJECT_CHAT_SUBSCRIPTION_DATA=PRESERVED');
    // Always refuse live Stripe events, including on read-only preview.
    // A review-required preview succeeds without implying reset approval.
    if (!apply) {
      if (liveStripeEvents > 0) throw Error('LIVE_STRIPE_EVENTS_REFUSE_RESET');
      if (nonTestSignal > 0) {
        console.log('PREVIEW_REVIEW_REQUIRED=YES TEST_ONLY_PAYMENT_PROVENANCE_UNVERIFIED');
        console.log('RESET_APPLY_REQUIRES_ADDITIONAL_ATTESTATIONS=YES');
      }
      await client.query('ROLLBACK'); inTransaction=false;
      console.log('PREVIEW_PASS DATABASE_WRITE=NO STRIPE_REQUEST=NO AI_REQUEST=NO');
      return;
    }
    assertApplyAuthorization({argv,fingerprint,paymentRiskRecords:nonTestSignal});
    assertDisposableSignals({liveStripeEvents,nonTestSignal,riskRecordsAttested:nonTestSignal>0});
    if (nonTestSignal>0) {
      console.log('TEST_ONLY_RISK_ATTESTATIONS_ACCEPTED=YES');
      console.log('WARNING=OPERATOR_ATTESTATION_IS_NOT_PROVIDER_EVIDENCE');
    }
    // Deleting in dependency order and without CASCADE makes unknown new
    // foreign-key dependencies fail closed rather than deleting other domains.
    for(const table of CREDIT_TABLES) {
      const deleted = await client.query(`DELETE FROM "${table}"`);
      if (deleted.rowCount !== rows.find(row=>row.table===table).count)
        throw Error('RESET_DELETE_COUNT_MISMATCH');
    }
    for(const table of CREDIT_TABLES) {
      const check=await client.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      if(check.rows[0].n!==0) throw Error('RESET_NOT_EMPTY');
    }
    await client.query('COMMIT'); inTransaction=false;
    console.log('RESET_PASS AI_CREDIT_DOMAIN_EMPTY=YES DB_SCHEMA_UNCHANGED=YES');
    console.log('STRIPE_REQUEST=NO PROVIDER_REQUEST=NO GIT=NO');
    console.log('NOTE=Preserved Stripe events and subscription records are not replayed or modified.');
  } finally {
    if(inTransaction) await client.query('ROLLBACK').catch(()=>{});
    await client.end();
  }
}
run().catch(error=>{
  console.error('DISPOSABLE_AI_CREDIT_RESET_ABORTED',error instanceof Error ? error.message : 'UNKNOWN');
  process.exitCode=2;
});
