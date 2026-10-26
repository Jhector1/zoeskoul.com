/** E16C3B rollback-only PostgreSQL schema smoke test.
 * Run from packages/db with: ZOEBUILD_AI_CREDIT_PG_SMOKE=ROLLBACK_ONLY \
 *   node --env-file=../../.env.shared.local scripts/ai-credit-ledger-postgres-smoke.mjs
 * Every write occurs inside one explicit transaction that is ALWAYS rolled back.
 * This is a schema smoke test, not a full concurrent Prisma-service integration test.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

if (process.env.ZOEBUILD_AI_CREDIT_PG_SMOKE !== 'ROLLBACK_ONLY') {
  throw new Error('REFUSED: ZOEBUILD_AI_CREDIT_PG_SMOKE=ROLLBACK_ONLY is required');
}
if (!process.env.DATABASE_URL) throw new Error('REFUSED: DATABASE_URL is missing');
if (process.env.ADMIN_DATABASE_URL || process.env.WEB_DATABASE_URL) {
  // Direct pg uses only DATABASE_URL, regardless of Prisma's runtime preference.
  console.log('INFO: smoke test uses DATABASE_URL only (not ADMIN_DATABASE_URL / WEB_DATABASE_URL)');
}
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname) ||
    database.port !== '5432' ||
    decodeURIComponent(database.pathname) !== '/learnoir_db' ||
    !['postgres:', 'postgresql:'].includes(database.protocol)) {
  throw new Error('REFUSED: expected local PostgreSQL localhost:5432/learnoir_db');
}
if (database.searchParams.get('schema') && database.searchParams.get('schema') !== 'public') {
  throw new Error('REFUSED: expected public schema');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1,
  connectionTimeoutMillis: 5000 });
const userId = `e16c3b_smoke_${randomUUID()}`;
let client;
let begun = false;
let success = false;
async function expectedPgFailure(label, statement, params, code) {
  const savepoint = `smoke_${label.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(statement, params);
    throw new Error(`FAIL ${label}: SQL unexpectedly succeeded`);
  } catch (error) {
    if (error.code !== code) throw error;
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
  console.log(`PASS ${label}`);
}
try {
  client = await pool.connect();
  const tables = ['AiCreditWallet', 'AiCreditLot', 'AiCreditReservation',
    'AiCreditReservationAllocation', 'AiCreditLedgerEntry'];
  for (const name of tables) {
    const { rows } = await client.query('SELECT to_regclass($1) AS table_name', [`public."${name}"`]);
    if (!rows[0]?.table_name) throw new Error(`Missing table: ${name}`);
  }
  console.log('PASS all five ledger tables exist');
  const trigger = await client.query(`
    SELECT t.tgenabled, p.proname FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'AiCreditLedgerEntry'
    AND t.tgname = 'AiCreditLedgerEntry_immutable' AND NOT t.tgisinternal`);
  if (trigger.rows.length !== 1 || trigger.rows[0].tgenabled !== 'O' ||
      trigger.rows[0].proname !== 'ai_credit_ledger_immutable') {
    throw new Error('Missing or disabled immutable-ledger trigger');
  }
  console.log('PASS immutable-ledger trigger exists');

  await client.query('BEGIN');
  begun = true;
  await client.query('SET LOCAL lock_timeout = \'3s\'');
  await client.query('INSERT INTO "AiCreditWallet" ("userId") VALUES ($1)', [userId]);
  const locked = await client.query('SELECT "userId" FROM "AiCreditWallet" WHERE "userId"=$1 FOR UPDATE', [userId]);
  if (locked.rowCount !== 1) throw new Error('Wallet row lock failed');
  console.log('PASS wallet row can be locked for update');

  const lotId = randomUUID();
  await client.query(`INSERT INTO "AiCreditLot"
    ("id", "userId", "sourceKey", "kind", "grantedUnits", "availableUnits")
    VALUES ($1, $2, $3, 'purchased', 1000, 1000)`,
    [lotId, userId, `pg-smoke-${randomUUID()}`]);
  await expectedPgFailure('negative lot balance constraint',
    'UPDATE "AiCreditLot" SET "availableUnits" = -1 WHERE "id" = $1', [lotId], '23514');

  const entryId = randomUUID();
  const eventKey = `pg-smoke-${randomUUID()}`;
  await client.query(`INSERT INTO "AiCreditLedgerEntry"
    ("id", "userId", "lotId", "eventKey", "kind", "availableDelta")
    VALUES ($1, $2, $3, $4, 'grant', 1000)`,
    [entryId, userId, lotId, eventKey]);
  await expectedPgFailure('immutable ledger UPDATE',
    'UPDATE "AiCreditLedgerEntry" SET "availableDelta"=9 WHERE "id"=$1',
    [entryId], 'P0001');
  await expectedPgFailure('immutable ledger DELETE',
    'DELETE FROM "AiCreditLedgerEntry" WHERE "id"=$1', [entryId], 'P0001');
  await expectedPgFailure('duplicate ledger event key',
    `INSERT INTO "AiCreditLedgerEntry"
       ("id", "userId", "lotId", "eventKey", "kind", "availableDelta")
       VALUES ($1,$2,$3,$4,'grant',1000)`,
    [randomUUID(), userId, lotId, eventKey], '23505');
  await expectedPgFailure('ledger foreign key',
    `INSERT INTO "AiCreditLedgerEntry"
       ("id", "userId", "lotId", "eventKey", "kind", "availableDelta")
       VALUES ($1,$2,$3,$4,'grant',1000)`,
    [randomUUID(), userId, `not-a-real-lot-${randomUUID()}`, `pg-smoke-${randomUUID()}`], '23503');
  success = true;
} finally {
  if (client && begun) {
    try {
      await client.query('ROLLBACK');
      console.log('ROLLBACK complete: no test credits committed');
    } catch (error) {
      success = false;
      console.error('ROLLBACK FAILED:', error.message);
    }
  }
  if (client) {
    try {
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM "AiCreditWallet" WHERE "userId"=$1', [userId]);
      if (rows[0]?.count !== 0) throw new Error('Test wallet persisted after rollback');
      console.log('PASS no test wallet persisted');
    } finally {
      client.release();
    }
  }
  await pool.end();
}
if (!success) throw new Error('E16C3B smoke test did not complete');
console.log('E16C3B_PG_SCHEMA_SMOKE_PASS');
