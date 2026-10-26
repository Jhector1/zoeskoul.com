/**
 * V12J.8B: read-only constraint evidence for the real PostgreSQL refund
 * acceptance failure. Never alters constraints, wallets, lots or migrations.
 * Requires the same explicit developer DB approvals as V12J.8A.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assessQuantityConstraint(constraints) {
  const target = constraints.filter(c => c.name === 'AiCreditLot_quantities_check');
  if (target.length !== 1) return { status: 'CONSTRAINT_MISSING_OR_AMBIGUOUS', count: target.length };
  const c=target[0];
  // Evidence only: do not infer that naming a column proves an invariant.
  return {status:'CONSTRAINT_FOUND', validated:c.validated, definition:c.definition,
    referencesReversedUnits:/\\?"?reversedUnits\\?"?/i.test(c.definition),
    referencesReversalTarget:/\\?"?reversalTargetUnits\\?"?/i.test(c.definition),
    referencesShortfall:/\\?"?reversalShortfallUnits\\?"?/i.test(c.definition)};
}

export async function readConstraintEvidence(client, confirmed) {
  await client.query('BEGIN READ ONLY');
  try {
    const {rows:[identity]}=await client.query(`SELECT current_database() AS database,
      current_user AS db_role, current_setting('transaction_read_only') AS readonly,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      pg_postmaster_start_time()::text AS server_started_at`);
    if (!identity || identity.database !== confirmed.database || identity.db_role !== confirmed.role ||
      identity.readonly !== 'on' || identity.server_address !== confirmed.serverAddress ||
      identity.server_port !== confirmed.serverPort || identity.server_started_at !== confirmed.serverStartedAt)
      throw Error('AI_SETTLEMENT_CONSTRAINT_DATABASE_IDENTITY_MISMATCH');
    const {rows}=await client.query(`SELECT c.conname AS name,
      pg_get_constraintdef(c.oid, true) AS definition,
      c.convalidated AS validated
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public."AiCreditLot"') AND c.contype = 'c'
      ORDER BY c.conname`);
    // Quantities and invariant flags for the retained *synthetic* V12J.8A
    // lots only. No user IDs, source keys, payment IDs or row-level balances.
    const {rows:[synthetic]}=await client.query(`SELECT
      count(*)::int AS lots,
      count(*) FILTER (WHERE "availableUnits" + "reservedUnits" + "consumedUnits" +
        "expiredUnits" + "reversedUnits" <> "grantedUnits")::int AS conservation_failures,
      count(*) FILTER (WHERE "reversedUnits" + "reversalShortfallUnits" <>
        "reversalTargetUnits")::int AS reversal_target_failures,
      count(*) FILTER (WHERE "reversedUnits" > 0)::int AS reversed_lots
      FROM public."AiCreditLot"
      WHERE "userId" LIKE 'pg-ai-v12j8a-%'`);
    return {identity:{database:identity.database, role:identity.db_role},
      constraintCount:rows.length, constraints:rows, synthetic};
  } finally { await client.query('ROLLBACK'); }
}

const isMain=process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if(isMain) {
  let pool;
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--inspect')
      throw Error('USAGE_INSPECT_ONLY');
    if (process.env.AI_SETTLEMENT_ACCEPTANCE_RUN !== 'V12J8A_VERIFIED_DEVELOPMENT_DATABASE')
      throw Error('AI_SETTLEMENT_EXPLICIT_APPROVAL_REQUIRED');
    // Same coupled approval as V12J.8A runner, scoped to this process.
    process.env.BILLING_ACCEPTANCE_RUN = 'V12J5_VERIFIED_DEVELOPMENT_DATABASE';
    const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=await import('./billing-postgres-dev-preflight.mjs');
    const raw=selectedDevDatabaseUrl();
    const confirmed=await preflightBillingDevelopmentDatabase(raw);
    if(!raw || !confirmed.ok)throw Error('AI_SETTLEMENT_CONSTRAINT_PREFLIGHT_FAILED');
    const {Pool}=await import('pg');
    pool=new Pool({connectionString:raw,max:1,connectionTimeoutMillis:7000,
      idleTimeoutMillis:1000,statement_timeout:9000});
    const client=await pool.connect();
    try {
      const evidence=await readConstraintEvidence(client,confirmed);
      console.log(`AI_SETTLEMENT_CONSTRAINT_PREFLIGHT_PASS database=${evidence.identity.database} role=${evidence.identity.role} readOnly=YES`);
      const inspected=assessQuantityConstraint(evidence.constraints);
      console.log('LOT_QUANTITIES_CHECK '+JSON.stringify(inspected));
      console.log(`ALL_CHECK_CONSTRAINTS=${evidence.constraintCount}`);
      for(const c of evidence.constraints) {
        if(c.name !== 'AiCreditLot_quantities_check')
          console.log('ADDITIONAL_CHECK '+JSON.stringify(c));
      }
      console.log('SYNTHETIC_LOTS '+JSON.stringify(evidence.synthetic));
      console.log('NEXT=REVIEW_CONSTRAINT_DEFINITION_BEFORE_ANY_SCHEMA_OR_LEDGER_CHANGE');
      console.log('AI_SETTLEMENT_CONSTRAINT_AUDIT_DONE postgres=READ_ONLY writes=NO');
    } finally {client.release();}
  } catch(e) {
    console.error('AI_SETTLEMENT_CONSTRAINT_REFUSED reason='+(e instanceof Error?e.message:'UNKNOWN'));
    process.exitCode=1;
  } finally {if(pool)await pool.end();}
}
