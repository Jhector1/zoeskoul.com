/**
 * V12J.8C: READ-ONLY development database migration preflight/postflight.
 * No ALTER, DDL, migration execution, Stripe or provider calls.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const OLD_CHECK = "CHECK (\"grantedUnits\" > 0 AND \"availableUnits\" >= 0 AND \"reservedUnits\" >= 0 AND \"consumedUnits\" >= 0 AND \"expiredUnits\" >= 0 AND \"grantedUnits\" = (\"availableUnits\" + \"reservedUnits\" + \"consumedUnits\" + \"expiredUnits\"))";
export const NEW_CHECK = "CHECK (\"grantedUnits\" > 0 AND \"availableUnits\" >= 0 AND \"reservedUnits\" >= 0 AND \"consumedUnits\" >= 0 AND \"expiredUnits\" >= 0 AND \"reversedUnits\" >= 0 AND \"grantedUnits\" = (\"availableUnits\" + \"reservedUnits\" + \"consumedUnits\" + \"expiredUnits\" + \"reversedUnits\"))";
export const REFUND_CHECK = "CHECK (\"reversedUnits\" >= 0 AND \"reversalTargetUnits\" >= 0 AND \"reversalShortfallUnits\" >= 0 AND \"reversalTargetUnits\" = (\"reversedUnits\" + \"reversalShortfallUnits\") AND \"reversalTargetUnits\" <= \"grantedUnits\")";

export function assessAiCreditConstraintChange({constraints, violations, stage}) {
  if (!['preflight','postflight'].includes(stage)) return {ok:false, reason:'INVALID_STAGE'};
  const byName=(name)=>constraints.filter(c=>c.name===name);
  const target=byName('AiCreditLot_quantities_check');
  const reversal=byName('AiCreditLot_refund_reversal_nonnegative_chk');
  const legacy=byName('AiCreditLot_quantities_legacy_check');
  if (target.length!==1 || reversal.length!==1 || legacy.length!==0 || constraints.length!==2)
    return {ok:false, reason:'CONSTRAINT_SET_MISMATCH'};
  if (reversal[0].validated!==true || reversal[0].definition!==REFUND_CHECK)
    return {ok:false, reason:'REFUND_CONSTRAINT_DRIFT'};
  const expected=stage==='preflight'?OLD_CHECK:NEW_CHECK;
  if (target[0].validated!==true || target[0].definition!==expected)
    return {ok:false, reason:'QUANTITY_CONSTRAINT_DRIFT'};
  if (!violations || !Number.isSafeInteger(violations.totalLots) || violations.totalLots<0 ||
      !Number.isSafeInteger(violations.newConservationFailures) ||
      !Number.isSafeInteger(violations.refundTargetFailures) ||
      violations.newConservationFailures!==0 || violations.refundTargetFailures!==0)
    return {ok:false, reason:'EXISTING_LEDGER_INVARIANT_FAILURE'};
  return {ok:true, stage, totalLots:violations.totalLots,
    newConservationFailures:0, refundTargetFailures:0};
}

export async function readAiCreditConstraintChange(client, expectedIdentity) {
  await client.query('BEGIN READ ONLY');
  try {
    const {rows:[identity]}=await client.query(`SELECT current_database() AS database,
      current_user AS db_role, current_setting('transaction_read_only') AS readonly,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      pg_postmaster_start_time()::text AS server_started_at`);
    if (!identity || identity.database!==expectedIdentity.database ||
      identity.db_role!==expectedIdentity.role || identity.readonly!=='on' ||
      identity.server_address!==expectedIdentity.serverAddress ||
      identity.server_port!==expectedIdentity.serverPort ||
      identity.server_started_at!==expectedIdentity.serverStartedAt)
      throw Error('V12J8C_DATABASE_IDENTITY_MISMATCH');
    const {rows:constraints}=await client.query(`SELECT c.conname AS name,
      pg_get_constraintdef(c.oid, true) AS definition, c.convalidated AS validated
      FROM pg_constraint c
      WHERE c.conrelid=to_regclass('public."AiCreditLot"') AND c.contype='c'
      ORDER BY c.conname`);
    // No raw financial balances or IDs are returned; read *all* lot invariant
    // counts, not just synthetic fixtures. This also checks older real lots.
    const {rows:[v]}=await client.query(`SELECT count(*)::int AS "totalLots",
      count(*) FILTER (WHERE NOT (
        "grantedUnits" > 0 AND "availableUnits" >= 0 AND "reservedUnits" >= 0
        AND "consumedUnits" >= 0 AND "expiredUnits" >= 0 AND "reversedUnits" >= 0
        AND "grantedUnits" = ("availableUnits" + "reservedUnits" +
          "consumedUnits" + "expiredUnits" + "reversedUnits")
      ))::int AS "newConservationFailures",
      count(*) FILTER (WHERE NOT (
        "reversedUnits" >= 0 AND "reversalTargetUnits" >= 0
        AND "reversalShortfallUnits" >= 0 AND
        "reversalTargetUnits" = ("reversedUnits" + "reversalShortfallUnits")
        AND "reversalTargetUnits" <= "grantedUnits"
      ))::int AS "refundTargetFailures" FROM public."AiCreditLot"`);
    return {identity:{database:identity.database,role:identity.db_role},
      constraints, violations:v};
  } finally {await client.query('ROLLBACK');}
}

const isMain=process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if (isMain) {
  let pool;
  try {
    if (process.argv.length!==3 || !['--preflight','--postflight'].includes(process.argv[2]))
      throw Error('V12J8C_USAGE_PRE_OR_POST_FLIGHT');
    if (process.env.AI_SETTLEMENT_ACCEPTANCE_RUN!=='V12J8A_VERIFIED_DEVELOPMENT_DATABASE')
      throw Error('V12J8C_EXPLICIT_DEVELOPMENT_APPROVAL_REQUIRED');
    process.env.BILLING_ACCEPTANCE_RUN='V12J5_VERIFIED_DEVELOPMENT_DATABASE';
    const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=
      await import('./billing-postgres-dev-preflight.mjs');
    const raw=selectedDevDatabaseUrl();
    const expectedIdentity=await preflightBillingDevelopmentDatabase(raw);
    if(!raw || !expectedIdentity?.ok)throw Error('V12J8C_DEVELOPMENT_PREFLIGHT_FAILED');
    const {Pool}=await import('pg');
    pool=new Pool({connectionString:raw,max:1,connectionTimeoutMillis:7000,
      idleTimeoutMillis:1000,statement_timeout:12000});
    const client=await pool.connect();
    try {
      const evidence=await readAiCreditConstraintChange(client,expectedIdentity);
      const stage=process.argv[2].slice(2);
      const checked=assessAiCreditConstraintChange({...evidence,stage});
      console.log(`V12J8C_READ_ONLY_PREFLIGHT database=${evidence.identity.database} role=${evidence.identity.role}`);
      console.log(`V12J8C_AUDIT stage=${stage} lots=${evidence.violations.totalLots} `+
        `quantityFailures=${evidence.violations.newConservationFailures} `+
        `reversalFailures=${evidence.violations.refundTargetFailures}`);
      if(!checked.ok)throw Error(checked.reason);
      console.log(`V12J8C_${stage.toUpperCase()}_PASS noChanges=YES migrationNotExecuted=YES`);
    } finally {client.release();}
  } catch(e) {
    console.error(`V12J8C_REFUSED reason=${e instanceof Error && /^V12J8C_|^[A-Z_]+$/.test(e.message)?e.message:'CHECK_FAILED'}`);
    process.exitCode=1;
  } finally {if(pool)await pool.end();}
}
