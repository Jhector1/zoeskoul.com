/**
 * E16C3C: real PostgreSQL/Prisma ledger concurrency verification.
 * EXECUTION GATE: E16C3C_TEST_MODE=EPHEMERAL_PG.
 * Must run from packages/db with Node >=22 and --import tsx.
 * Creates a uniquely named local database, installs ONLY the E16C3 migration,
 * exercises actual credit ledger service via two PrismaPg clients, then drops
 * only the database created by THIS invocation. Never drops development DB.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  grantAiCreditLot,
  reserveAiCredits,
  settleAiCredits,
  releaseUnusedAiReservation,
  getAiCreditBalance,
} from '../../platform-server/src/ai-credits/aiCreditLedger.ts';

if (process.env.E16C3C_TEST_MODE !== 'EPHEMERAL_PG') {
  throw new Error('REFUSED: set E16C3C_TEST_MODE=EPHEMERAL_PG explicitly');
}
if (!process.env.DATABASE_URL) throw new Error('REFUSED: DATABASE_URL missing');
const original = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(original.hostname) ||
    original.port !== '5432' ||
    decodeURIComponent(original.pathname) !== '/learnoir_db' ||
    !['postgres:', 'postgresql:'].includes(original.protocol) ||
    (original.searchParams.has('schema') && original.searchParams.get('schema') !== 'public')) {
  throw new Error('REFUSED: expected local development database localhost:5432/learnoir_db');
}
// The previous schema smoke passed over IPv4, not hostname resolution.
original.hostname = '127.0.0.1';
const migration = readFileSync(resolve('prisma/migrations/20261019073000_e16c3_ai_credit_ledger/migration.sql'), 'utf8');
if (createHash('sha256').update(migration).digest('hex') !==
    '353fb819642b616e1f6b4774088ece1b96921943cf5a900a51b85aa5a4f3a750') {
  throw new Error('REFUSED: unexpected E16C3 migration contents');
}
const ephemeralDb = `zoebuild_e16c3c_${randomBytes(7).toString('hex')}`;
assert.match(ephemeralDb, /^zoebuild_e16c3c_[0-9a-f]{14}$/);
const ephemeralUrl = new URL(original);
ephemeralUrl.pathname = `/${ephemeralDb}`;
const admin = new pg.Client({ connectionString: original.toString(), connectionTimeoutMillis: 15000 });
const pools = [];
const clients = [];
let created = false;
let count = 0;
let failed = null;
let cleanupFailed = null;
const now = new Date('2026-10-19T12:00:00.000Z');
const conversion = {
  versionId: 'pg-test-conversion-v1',
  creditUnitsPerCredit: '1000',
  creditValueUsdNano: '1000000000', // 1000 units per actual USD in this TEST
  markupNumerator: '1',
  markupDenominator: '1',
};
const pricingVersionId = 'pg-test-price-v1';
function mkClient() {
  const pool = new pg.Pool({ connectionString: ephemeralUrl.toString(), max: 3,
    connectionTimeoutMillis: 15000, statement_timeout: 12000 });
  pools.push(pool);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['error'] });
  clients.push(prisma);
  return prisma;
}
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
function grant(client, userId, sourceKey, units, kind = 'purchased', expiresAt = null) {
  return grantAiCreditLot({client, userId, sourceKey, units, kind, expiresAt, now,
    origin: kind === 'subscription' ? 'verified-subscription-period' : 'verified-stripe-payment'});
}
function reserve(client, userId, key, units, at = now) {
  return reserveAiCredits({client, userId, idempotencyKey: key, maximumUnits: units,
    pricingVersionId, conversion, now: at});
}
async function balance(client, userId, at = now) {
  return getAiCreditBalance({client, userId, now: at});
}
function errorCodeMatch(settlement, code) {
  return settlement.status === 'rejected' && settlement.reason?.code === code;
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${ephemeralDb}"`);
  created = true;
  console.log('ISOLATED_TEST_DATABASE_CREATED:', ephemeralDb);
  const initializer = new pg.Client({ connectionString: ephemeralUrl.toString(), connectionTimeoutMillis: 15000 });
  try {
    await initializer.connect();
    await initializer.query(migration);
  } finally {
    await initializer.end().catch(() => {});
  }
  console.log('PASS isolated E16C3 schema initialized (no production migration)');
  const first = mkClient();
  const second = mkClient();
  await first.$connect();
  await second.$connect();

  await test('simultaneous reservations on distinct Prisma connections cannot double-spend', async () => {
    const userId = `${ephemeralDb}:parallel`;
    await grant(first, userId, `${ephemeralDb}:fund:parallel`, '1000');
    const results = await Promise.allSettled([
      reserve(first, userId, `${ephemeralDb}:parallel-a`, '800'),
      reserve(second, userId, `${ephemeralDb}:parallel-b`, '800'),
    ]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(results.filter(x => errorCodeMatch(x, 'INSUFFICIENT_CREDITS')).length, 1);
    assert.deepEqual(await balance(first, userId), {
      subscriptionAvailableUnits: '0', purchasedAvailableUnits: '200', reservedUnits: '800',
    });
    assert.equal(await first.aiCreditReservation.count({where: {userId}}), 1);
  });

  await test('a held PostgreSQL wallet row lock blocks another Prisma client', async () => {
    const userId = `${ephemeralDb}:lock`;
    await grant(first, userId, `${ephemeralDb}:fund:lock`, '1000');
    const blocker = new pg.Client({connectionString: ephemeralUrl.toString(), connectionTimeoutMillis: 15000});
    await blocker.connect();
    let waiting;
    let resolved = false;
    try {
      await blocker.query('BEGIN');
      const rows = await blocker.query('SELECT "userId" FROM "AiCreditWallet" WHERE "userId"=$1 FOR UPDATE', [userId]);
      assert.equal(rows.rowCount, 1);
      waiting = reserve(second, userId, `${ephemeralDb}:lock-reserve`, '300')
        .then(value => { resolved = true; return value; }, error => { resolved = true; throw error; });
      await new Promise(resolve => setTimeout(resolve, 180));
      assert.equal(resolved, false, 'Prisma reservation should wait for wallet lock');
    } finally {
      await blocker.query('ROLLBACK').catch(() => {});
      await blocker.end().catch(() => {});
    }
    assert.equal((await waiting).created, true);
    assert.equal((await balance(first, userId)).reservedUnits, '300');
  });

  await test('simultaneous same-key retry issues only one reservation', async () => {
    const userId = `${ephemeralDb}:retry`;
    await grant(first, userId, `${ephemeralDb}:fund:retry`, '1000');
    const results = await Promise.all([
      reserve(first, userId, `${ephemeralDb}:same-key`, '600'),
      reserve(second, userId, `${ephemeralDb}:same-key`, '600'),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(results.filter(x => x.created).length, 1);
    assert.equal(await first.aiCreditReservation.count({where: {userId}}), 1);
    assert.equal((await balance(first, userId)).reservedUnits, '600');
  });

  await test('duplicate funding event creates exactly one credit lot', async () => {
    const userId = `${ephemeralDb}:funding`;
    const key = `${ephemeralDb}:invoice:one`;
    const results = await Promise.allSettled([
      grant(first, userId, key, '400'), grant(second, userId, key, '400'),
    ]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 2,
      'same-user simultaneous funding retries must both succeed');
    assert.equal(results.filter(x => x.status === 'fulfilled' && x.value.created).length, 1,
      'only one concurrent funding event may create the lot');
    assert.equal(results.filter(x => x.status === 'fulfilled' && !x.value.created).length, 1,
      'the other concurrent funding attempt must return an idempotent replay');
    assert.equal((await grant(second, userId, key, '400')).created, false);
    assert.equal(await first.aiCreditLot.count({where: {userId}}), 1);
    assert.equal(await first.aiCreditLedgerEntry.count({where: {userId, kind: 'grant'}}), 1);
  });

  await test('settlement is exact, idempotent and releases unused credits', async () => {
    const userId = `${ephemeralDb}:settlement`;
    await grant(first, userId, `${ephemeralDb}:fund:settlement`, '1000');
    const key = `${ephemeralDb}:settle-once`;
    await reserve(first, userId, key, '800');
    const pricedUsage = { pricingVersionId, costUsdNano: '400000000' }; // 400 units
    const result = await settleAiCredits({client: second, userId, idempotencyKey: key, pricedUsage, now});
    assert.equal(result.settledUnits, '400');
    assert.equal(result.created, true);
    const repeated = await settleAiCredits({client: first, userId, idempotencyKey: key, pricedUsage, now});
    assert.equal(repeated.created, false);
    assert.deepEqual(await balance(first, userId), {
      subscriptionAvailableUnits: '0', purchasedAvailableUnits: '600', reservedUnits: '0',
    });
    assert.equal(await first.aiCreditLedgerEntry.count({where: {userId, kind: 'consume'}}), 1);
  });

  await test('failed/over-budget settlement rolls back without changing balances', async () => {
    const userId = `${ephemeralDb}:rollback`;
    await grant(first, userId, `${ephemeralDb}:fund:rollback`, '1000');
    const key = `${ephemeralDb}:over-budget`;
    await reserve(first, userId, key, '500');
    const originalBalance = await balance(first, userId);
    const ledgerCount = await first.aiCreditLedgerEntry.count({where: {userId}});
    await assert.rejects(
      settleAiCredits({client: second, userId, idempotencyKey: key,
        pricedUsage: {pricingVersionId, costUsdNano: '900000000'}, now}),
      {code: 'SETTLEMENT_EXCEEDS_RESERVED'});
    assert.deepEqual(await balance(first, userId), originalBalance);
    assert.equal(await first.aiCreditLedgerEntry.count({where: {userId}}), ledgerCount);
    await releaseUnusedAiReservation({client: first, userId, idempotencyKey: key,
      pricingVersionId, providerNotBilledConfirmed: true, now});
    assert.equal((await balance(first, userId)).purchasedAvailableUnits, '1000');
  });

  await test('expired included credits never become spendable again', async () => {
    const userId = `${ephemeralDb}:expiration`;
    const expiresAt = new Date('2026-10-20T00:00:00Z');
    await grant(first, userId, `${ephemeralDb}:fund:expiring`, '1000', 'subscription', expiresAt);
    const key = `${ephemeralDb}:expiring-reserve`;
    await reserve(first, userId, key, '800');
    const after = new Date('2026-10-21T00:00:00Z');
    await settleAiCredits({client: second, userId, idempotencyKey: key,
      pricedUsage: {pricingVersionId, costUsdNano: '200000000'}, now: after});
    assert.equal((await balance(first, userId, after)).subscriptionAvailableUnits, '0');
    await assert.rejects(reserve(second, userId, `${ephemeralDb}:too-late`, '1', after),
      {code: 'INSUFFICIENT_CREDITS'});
  });

  await test('ledger entries remain immutable in real PostgreSQL', async () => {
    const userId = `${ephemeralDb}:immutability`;
    await grant(first, userId, `${ephemeralDb}:fund:immutable`, '100');
    const entry = await first.aiCreditLedgerEntry.findFirstOrThrow({where: {userId}});
    const connection = new pg.Client({connectionString: ephemeralUrl.toString(), connectionTimeoutMillis: 15000});
    try {
      await connection.connect();
      for (const sql of [
        'UPDATE "AiCreditLedgerEntry" SET "availableDelta"=0 WHERE "id"=$1',
        'DELETE FROM "AiCreditLedgerEntry" WHERE "id"=$1',
      ]) {
        await connection.query('BEGIN');
        try {
          await connection.query(sql, [entry.id]);
          throw new Error('Ledger mutation unexpectedly succeeded');
        } catch (error) {
          if (error.code !== 'P0001') throw error;
        } finally {
          await connection.query('ROLLBACK');
        }
      }
    } finally { await connection.end().catch(() => {}); }
  });
} catch (error) {
  failed = error;
  console.error('E16C3C_TEST_FAILURE:', error?.code ?? error?.message ?? error);
} finally {
  for (const client of clients) {
    try { await client.$disconnect(); } catch (e) { console.error('Disconnect warning:', e?.message); }
  }
  for (const pool of pools) {
    try { await pool.end(); } catch (e) { /* Prisma may already close adapter pool. */ }
  }
  if (created) {
    try {
      await admin.query(`DROP DATABASE "${ephemeralDb}" WITH (FORCE)`);
      console.log('EPHEMERAL_TEST_DATABASE_REMOVED:', ephemeralDb);
    } catch (error) {
      cleanupFailed = error;
      console.error('EPHEMERAL_DATABASE_CLEANUP_FAILED:', ephemeralDb, error?.message);
    }
  }
  try { await admin.end(); } catch { /* connection may never have opened */ }
}
if (failed || cleanupFailed) process.exitCode = 1;
else console.log(`E16C3C_REAL_POSTGRES_CONCURRENCY_PASS (${count} test cases)`);
