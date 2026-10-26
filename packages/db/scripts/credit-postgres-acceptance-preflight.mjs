/**
 * V12I.4: read-only PostgreSQL acceptance preflight.
 * Never reads or falls back to DATABASE_URL / WEB_DATABASE_URL / ADMIN_DATABASE_URL.
 * A separate, empty, explicitly marked disposable database is mandatory.
 */
import { Pool } from "pg";

const PURPOSE = "V12I4_CREDIT_ACCEPTANCE_DISPOSABLE";
const NAME = /^zoeskoul_credit_acceptance_[a-z0-9_]{4,48}$/;

export function validateCreditAcceptanceUrl(raw) {
  if (!raw || typeof raw !== "string") throw Error("ACCEPTANCE_DATABASE_URL_REQUIRED");
  let parsed;
  try { parsed = new URL(raw); } catch { throw Error("ACCEPTANCE_DATABASE_URL_INVALID"); }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.pathname) {
    throw Error("ACCEPTANCE_DATABASE_URL_INVALID");
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!NAME.test(database)) throw Error("ACCEPTANCE_DATABASE_NAME_NOT_DISPOSABLE");
  if (parsed.searchParams.has("schema") && parsed.searchParams.get("schema") !== "public") {
    throw Error("ACCEPTANCE_SCHEMA_MUST_BE_PUBLIC");
  }
  if (parsed.searchParams.has("pgbouncer") || parsed.searchParams.has("options")) {
    throw Error("ACCEPTANCE_CONNECTION_OPTIONS_NOT_ALLOWED");
  }
  return database;
}

/** Read-only check BEFORE the operator provisions Prisma tables in a new DB. */
export async function bootstrapCreditAcceptancePreflight(raw) {
  const database = validateCreditAcceptanceUrl(raw);
  const pool = new Pool({ connectionString: raw, max: 1, connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 1000, statement_timeout: 9000 });
  try {
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN READ ONLY");
      try {
        const { rows: [state] } = await conn.query(`
          SELECT current_database() AS database, current_schema() AS schema,
                 current_setting('transaction_read_only') AS readonly,
                 pg_is_in_recovery() AS replica,
                 (SELECT count(*)::integer FROM pg_catalog.pg_tables
                  WHERE schemaname = 'public') AS public_table_count`);
        if (state?.database !== database || state.schema !== "public" || state.readonly !== "on" ||
            state.replica || state.public_table_count !== 0) {
          throw Error("ACCEPTANCE_BOOTSTRAP_TARGET_NOT_FRESH_EMPTY_DATABASE");
        }
        await conn.query("ROLLBACK");
        return { ok: true, database, empty: true };
      } catch (error) { await conn.query("ROLLBACK"); throw error; }
    } finally { conn.release(); }
  } finally { await pool.end(); }
}

export async function preflightCreditAcceptance(raw) {
  const database = validateCreditAcceptanceUrl(raw);
  const pool = new Pool({ connectionString: raw, max: 2, connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 1000, statement_timeout: 9000 });
  try {
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN READ ONLY");
      try {
        const { rows: [meta] } = await conn.query(`
          SELECT current_database() AS database, current_schema() AS schema,
                 current_setting('transaction_read_only') AS readonly,
                 pg_is_in_recovery() AS replica,
                 to_regclass('public."User"') IS NOT NULL AS has_user,
                 to_regclass('public."TutoringCreditLedgerEntry"') IS NOT NULL AS has_tutoring,
                 to_regclass('public."AiCreditWallet"') IS NOT NULL AS has_wallet,
                 to_regclass('public."AiCreditLot"') IS NOT NULL AS has_lot,
                 to_regclass('public.__zoeskoul_credit_acceptance_guard') IS NOT NULL AS has_guard`);
        if (!meta || meta.database !== database || meta.schema !== "public" || meta.readonly !== "on" ||
            meta.replica || !meta.has_user || !meta.has_tutoring || !meta.has_wallet || !meta.has_lot || !meta.has_guard) {
          throw Error("ACCEPTANCE_DB_IDENTITY_SCHEMA_OR_GUARD_INVALID");
        }
        const { rows: guard } = await conn.query(
          'SELECT purpose FROM public.__zoeskoul_credit_acceptance_guard LIMIT 2');
        if (guard.length !== 1 || guard[0]?.purpose !== PURPOSE) throw Error("ACCEPTANCE_DISPOSABLE_MARKER_INVALID");
        const { rows: [counts] } = await conn.query('SELECT count(*)::integer AS n FROM public."User"');
        if (counts?.n !== 0) throw Error("ACCEPTANCE_DB_NOT_EMPTY_USERS");
        const { rows: [strays] } = await conn.query(`
           SELECT (SELECT count(*) FROM public."TutoringCreditLedgerEntry")::integer AS tutoring,
                  (SELECT count(*) FROM public."AiCreditWallet")::integer AS wallets,
                  (SELECT count(*) FROM public."AiCreditLot")::integer AS lots,
                  (SELECT count(*) FROM public."AiCreditReservation")::integer AS reservations`);
        if (Object.values(strays ?? {}).some(v => v !== 0)) throw Error("ACCEPTANCE_DB_NOT_EMPTY_CREDIT_LEDGER");
        await conn.query("ROLLBACK");
        return { ok: true, database, schema: "public", isolated: true, empty: true };
      } catch (error) { await conn.query("ROLLBACK"); throw error; }
    } finally { conn.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    if (process.argv.slice(2).includes("--bootstrap")) {
      const result = await bootstrapCreditAcceptancePreflight(process.env.CREDIT_ACCEPTANCE_DATABASE_URL);
      console.log(`CREDIT_PG_BOOTSTRAP_PASS database=${result.database} empty=YES writes=NO`);
    } else {
      const result = await preflightCreditAcceptance(process.env.CREDIT_ACCEPTANCE_DATABASE_URL);
      console.log(`CREDIT_PG_PREFLIGHT_PASS database=${result.database} schema=public empty=YES writes=NO`);
    }
  } catch (error) {
    console.error(`CREDIT_PG_PREFLIGHT_REFUSED reason=${error instanceof Error ? error.message : "UNKNOWN"}`);
    process.exitCode = 1;
  }
}
