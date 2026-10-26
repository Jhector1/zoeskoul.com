/**
 * V12J.16G — independent read-only operational hold snapshot.
 * Reports aggregate held-reservation visibility; not production sign-off or
 * authority to settle/release/charge. Never exposes user IDs, operation IDs,
 * provider IDs, prompts, connection strings, or provider secrets.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const REQUIRED_TABLES = Object.freeze([
  'AiCreditReservation', 'AiCreditReconciliationCase', 'AiCreditProviderRequest',
  'AiCreditWallet', 'AiCreditLot',
]);
const ID = /^[A-Za-z0-9_.-]{1,100}$/;
export const DEFAULT_AGE_MINUTES = 15;

export class HoldAuditRefusal extends Error {
  constructor(code) { super(code); this.name = 'HoldAuditRefusal'; }
}
function refuse(code) { throw new HoldAuditRefusal(code); }
function safeId(value) { return typeof value === 'string' && ID.test(value); }

export function parseHoldAuditArgs(args) {
  if (args.length === 1 && args[0] === '--inspect') return { mode: 'inspect' };
  if (args.length === 5 && (args[0] === '--audit' || args[0] === '--triage') && args[1] === '--database' &&
      args[3] === '--role' && safeId(args[2]) && safeId(args[4])) {
    return { mode: args[0] === '--triage' ? 'triage' : 'audit', database: args[2], role: args[4] };
  }
  refuse('USAGE_INSPECT_OR_AUDIT_OR_TRIAGE_WITH_EXACT_DATABASE_ROLE');
}
export function requirePgUrl(raw) {
  if (typeof raw !== 'string' || !raw) refuse('DATABASE_URL_NOT_LOADED');
  let parsed;
  try { parsed = new URL(raw); } catch { refuse('DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !parsed.hostname || !parsed.username || parsed.pathname.length < 2)
    refuse('DATABASE_URL_INVALID');
  return raw;
}

function unsignedCounter(v, label) {
  if (typeof v !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(v))
    refuse(`INVALID_AGGREGATE_${label}`);
  return BigInt(v);
}
export function assessHoldSnapshot(row, frozenWallets, conflictingCases) {
  const keys = ['held', 'aged', 'agedWithoutCase', 'agedWithoutDispatch',
    'agedDispatchWithoutResponse', 'agedWithPricedReceipt',
    'agedWithUnpricedResponse', 'settledMissingReceipt'];
  const stats = Object.fromEntries(keys.map(key => [key, unsignedCounter(row?.[key], key)]));
  stats.frozenWallets = unsignedCounter(frozenWallets, 'frozenWallets');
  stats.conflictingCases = unsignedCounter(conflictingCases, 'conflictingCases');
  if (stats.aged > stats.held || stats.agedWithoutCase > stats.aged ||
      stats.agedWithoutDispatch > stats.aged ||
      stats.agedDispatchWithoutResponse > stats.aged ||
      stats.agedWithPricedReceipt > stats.aged ||
      stats.agedWithUnpricedResponse > stats.aged) refuse('INCONSISTENT_AUDIT_AGGREGATES');
  const alert = stats.aged !== 0n || stats.settledMissingReceipt !== 0n ||
    stats.conflictingCases !== 0n || stats.frozenWallets !== 0n;
  return { alert, summary: Object.fromEntries(Object.entries(stats)
    .map(([key, count]) => [key, count.toString()])) };
}

const META_SQL = `SELECT current_database() AS database, current_user AS role,
 current_schema() AS schema, current_setting('transaction_read_only') AS readonly,
 pg_is_in_recovery() AS replica,
 to_regclass('public."AiCreditReservation"') IS NOT NULL AS reservations,
 to_regclass('public."AiCreditReconciliationCase"') IS NOT NULL AS cases,
 to_regclass('public."AiCreditProviderRequest"') IS NOT NULL AS dispatches,
 to_regclass('public."AiCreditWallet"') IS NOT NULL AS wallets,
 to_regclass('public."AiCreditLot"') IS NOT NULL AS lots,
 to_regclass('public."AiCreditResultJournal"') IS NOT NULL AS resultjournal`;

// All queries are aggregate-only. No financial identifiers leave the database.
const SNAPSHOT_SQL = `SELECT
 COUNT(*) FILTER (WHERE r.status::text = 'reserved')::text AS held,
 COUNT(*) FILTER (WHERE r.status::text = 'reserved' AND r."createdAt" <= $1)::text AS aged,
 COUNT(*) FILTER (WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
   AND c.id IS NULL)::text AS "agedWithoutCase",
 COUNT(*) FILTER (WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
   AND p.id IS NULL)::text AS "agedWithoutDispatch",
 COUNT(*) FILTER (WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
   AND p.id IS NOT NULL AND p."providerResponseId" IS NULL)::text AS "agedDispatchWithoutResponse",
 COUNT(*) FILTER (WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
   AND p."receiptUsageSha256" IS NOT NULL)::text AS "agedWithPricedReceipt",
 COUNT(*) FILTER (WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
   AND p."providerResponseId" IS NOT NULL AND p."receiptUsageSha256" IS NULL)::text AS "agedWithUnpricedResponse",
 COUNT(*) FILTER (WHERE r.status::text = 'settled' AND p.id IS NOT NULL
   AND p."receiptUsageSha256" IS NULL)::text AS "settledMissingReceipt"
 FROM public."AiCreditReservation" r
 LEFT JOIN public."AiCreditReconciliationCase" c ON c."reservationId" = r.id
 LEFT JOIN public."AiCreditProviderRequest" p ON p."reservationId" = r.id`;
const FROZEN_SQL = `SELECT COUNT(*)::text AS total FROM public."AiCreditWallet"
 WHERE "riskFrozenAt" IS NOT NULL`;
const OWNERSHIP_SQL = `SELECT COUNT(*)::text AS total FROM public."AiCreditReconciliationCase" c
 INNER JOIN public."AiCreditReservation" r ON c."reservationId" = r.id
 WHERE c."userId" <> r."userId"`;

/** V12J.16H: coarse, mutually exclusive cohorts and age buckets. No identifiers leave DB. */
const TRIAGE_SQL = `WITH aged AS (
 SELECT r."createdAt" AS created_at,
   EXISTS (SELECT 1 FROM public."AiCreditReconciliationCase" c
     WHERE c."reservationId" = r.id) AS has_case,
   EXISTS (SELECT 1 FROM public."AiCreditProviderRequest" p
     WHERE p."reservationId" = r.id) AS has_dispatch,
   EXISTS (SELECT 1 FROM public."AiCreditProviderRequest" p
     WHERE p."reservationId" = r.id AND p."providerResponseId" IS NOT NULL) AS has_response,
   EXISTS (SELECT 1 FROM public."AiCreditProviderRequest" p
     WHERE p."reservationId" = r.id AND p."receiptUsageSha256" IS NOT NULL) AS has_receipt,
   EXISTS (SELECT 1 FROM public."AiCreditWallet" w
     WHERE w."userId" = r."userId" AND w."riskFrozenAt" IS NOT NULL) AS owner_frozen
 FROM public."AiCreditReservation" r
 WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
)
SELECT
 COUNT(*)::text AS total,
 COUNT(*) FILTER (WHERE created_at > $2)::text AS "age15to60",
 COUNT(*) FILTER (WHERE created_at <= $2 AND created_at > $3)::text AS "age60to1440",
 COUNT(*) FILTER (WHERE created_at <= $3)::text AS "ageOver1440",
 COUNT(*) FILTER (WHERE NOT has_dispatch AND NOT has_response AND NOT has_receipt)::text AS "noRecordedDispatch",
 COUNT(*) FILTER (WHERE has_dispatch AND NOT has_response AND NOT has_receipt)::text AS "dispatchNoRecordedResponse",
 COUNT(*) FILTER (WHERE has_response AND NOT has_receipt)::text AS "recordedResponseWithoutReceipt",
 COUNT(*) FILTER (WHERE has_receipt)::text AS "pricedReceiptAwaitingSettlement",
 COUNT(*) FILTER (WHERE NOT has_case)::text AS "missingCase",
 COUNT(*) FILTER (WHERE has_case)::text AS "withCase",
 COUNT(*) FILTER (WHERE owner_frozen)::text AS "heldInFrozenWallet",
 COUNT(*) FILTER (WHERE has_receipt AND NOT has_response)::text AS "receiptWithoutResponseIdentity"
FROM aged`;
const JOURNAL_TRIAGE_SQL = `SELECT COUNT(*)::text AS total FROM public."AiCreditReservation" r
 WHERE r.status::text = 'reserved' AND r."createdAt" <= $1
 AND EXISTS (SELECT 1 FROM public."AiCreditResultJournal" j WHERE j."reservationId" = r.id)`;

export function assessHoldTriage(aggregate, journalCount, journalAvailable) {
  const keys=['total','age15to60','age60to1440','ageOver1440',
    'noRecordedDispatch','dispatchNoRecordedResponse','recordedResponseWithoutReceipt',
    'pricedReceiptAwaitingSettlement','missingCase','withCase',
    'heldInFrozenWallet','receiptWithoutResponseIdentity'];
  const stats=Object.fromEntries(keys.map(k=>[k,unsignedCounter(aggregate?.[k],k)]));
  const sum=(names)=>names.reduce((acc,k)=>acc+stats[k],0n);
  if (sum(['age15to60','age60to1440','ageOver1440'])!==stats.total ||
      sum(['noRecordedDispatch','dispatchNoRecordedResponse','recordedResponseWithoutReceipt',
           'pricedReceiptAwaitingSettlement'])!==stats.total ||
      stats.missingCase+stats.withCase!==stats.total ||
      stats.heldInFrozenWallet>stats.total || stats.receiptWithoutResponseIdentity>stats.pricedReceiptAwaitingSettlement)
    refuse('TRIAGE_AGGREGATES_INCONSISTENT');
  if (journalAvailable && unsignedCounter(journalCount,'journalCount')>stats.total)
    refuse('TRIAGE_JOURNAL_COUNT_INCONSISTENT');
  return { ...Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v.toString()])),
    journalAvailable: journalAvailable ? 'YES' : 'NO',
    agedWithResultJournal: journalAvailable ? unsignedCounter(journalCount,'journalCount').toString() : 'UNAVAILABLE' };
}

export async function readOnlyHoldAudit({ dbUrl, args, makePool, now = new Date(), emit = console.log }) {
  const parsed = parseHoldAuditArgs(args);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) refuse('TIME_INVALID');
  const url = requirePgUrl(dbUrl);
  const pool = makePool(url);
  let conn;
  try {
    conn = await pool.connect();
    await conn.query('BEGIN READ ONLY');
    try {
      const identity = (await conn.query(META_SQL)).rows[0];
      if (!identity || identity.schema !== 'public' || identity.readonly !== 'on' ||
        identity.replica !== false) refuse('READONLY_DATABASE_IDENTITY_INVALID');
      if (parsed.mode === 'inspect') {
        // Intentional: database/role are exposed to the operator during identity check.
        // They are not secrets; hostname, username/password and raw URI are never printed.
        emit(`V12J16G_DB_INSPECT database=${identity.database} role=${identity.role} schema=public readonly=YES writes=NO`);
        return { mode: 'inspect' };
      }
      if (identity.database !== parsed.database || identity.role !== parsed.role)
        refuse('CONFIRMED_DATABASE_ROLE_MISMATCH');
      if (![identity.reservations, identity.cases, identity.dispatches,
        identity.wallets, identity.lots].every(v => v === true))
        refuse('REQUIRED_CANONICAL_TABLES_MISSING');
      const olderThan = new Date(now.getTime() - DEFAULT_AGE_MINUTES * 60_000);
      // A PostgreSQL Client supports one in-flight query. Keep operations sequential
      // inside this one read-only transaction (pg@9 disallows concurrent query calls).
      const rows = await conn.query(SNAPSHOT_SQL, [olderThan]);
      const frozen = await conn.query(FROZEN_SQL);
      const conflicts = await conn.query(OWNERSHIP_SQL);
      const result = assessHoldSnapshot(rows.rows[0], frozen.rows[0]?.total,
        conflicts.rows[0]?.total);
      emit(`V12J16G_HOLD_AUDIT database=${parsed.database} role=${parsed.role} snapshot=${now.toISOString()} ageMinutes=${DEFAULT_AGE_MINUTES}`);
      for (const [name, value] of Object.entries(result.summary)) emit(`${name}=${value}`);
      emit(`V12J16G_REVIEW_STATUS=${result.alert ? 'INVESTIGATE_HOLDS_OR_RISK' : 'NO_AGED_HOLDS_OR_RISK_IN_SNAPSHOT'}`);
      emit('V12J16G_SCOPE=READ_ONLY_SNAPSHOT_NOT_PROVIDER_VERIFICATION_NOT_REFUND_ACCEPTANCE_NOT_OPS_APPROVAL');
      if (parsed.mode === 'triage') {
        const older60 = new Date(now.getTime() - 60 * 60_000);
        const older1440 = new Date(now.getTime() - 1440 * 60_000);
        const triageResult = (await conn.query(TRIAGE_SQL, [olderThan, older60, older1440])).rows[0];
        // Optional journal may be absent in an incomplete migration. Never claim
        // that an absent journal table means zero captured results.
        const journalCount = identity.resultjournal === true
          ? (await conn.query(JOURNAL_TRIAGE_SQL, [olderThan])).rows[0]?.total : null;
        const triage = assessHoldTriage(triageResult, journalCount, identity.resultjournal === true);
        if (triage.total !== result.summary.aged) refuse('TRIAGE_SNAPSHOT_COUNT_MISMATCH');
        emit('V12J16H_HOLD_TRIAGE=READ_ONLY_WITHOUT_IDENTIFIERS');
        for (const [key,value] of Object.entries(triage)) emit(`${key}=${value}`);
        emit('V12J16H_ACTION=RECONCILE_ORIGINAL_PROVIDER_EVIDENCE_BEFORE_ANY_LEDGER_WRITE');
        return { mode:'triage', ...result, triage };
      }
      return { mode: 'audit', ...result };
    } finally {
      await conn.query('ROLLBACK');
    }
  } finally {
    try { conn?.release(); } finally { await pool.end(); }
  }
}

export async function main(args = process.argv.slice(2), env = process.env) {
  // Parse/validate before loading pg or connecting. No provider/Stripe calls.
  parseHoldAuditArgs(args);
  requirePgUrl(env.DATABASE_URL);
  const { Pool } = await import('pg');
  const output = await readOnlyHoldAudit({
    dbUrl: env.DATABASE_URL, args,
    makePool: connectionString => new Pool({ connectionString, max: 1,
      connectionTimeoutMillis: 7000, idleTimeoutMillis: 1000, statement_timeout: 10000 }),
  });
  if ((output.mode === 'audit' || output.mode === 'triage') && output.alert) process.exitCode = 3;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = error instanceof HoldAuditRefusal ? error.message : 'DATABASE_READ_OR_SCHEMA_FAILED';
    console.error(`V12J16G_REFUSED reason=${code} values=REDACTED writes=NO`);
    process.exitCode = 2;
  });
}
