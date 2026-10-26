/**
 * V12I.4D: read-only preflight for running the EXISTING financial writers
 * against a user-verified development PostgreSQL database.
 * This is test infrastructure, never application subscription/billing logic.
 */
import { Pool } from "pg";

export function selectedDevDatabaseUrl() {
  return process.env.ADMIN_DATABASE_URL || process.env.WEB_DATABASE_URL || process.env.DATABASE_URL;
}

function checkUrl(raw) {
  if (!raw) throw Error("DEV_ACCEPTANCE_DATABASE_URL_NOT_LOADED");
  let url;
  try { url = new URL(raw); } catch { throw Error("DEV_ACCEPTANCE_DATABASE_URL_INVALID"); }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === "/") {
    throw Error("DEV_ACCEPTANCE_DATABASE_URL_INVALID");
  }
}

function expectedIdentifier(raw, field) {
  if (typeof raw !== "string" || !/^[\w.\-]{1,100}$/.test(raw)) throw Error(`${field}_REQUIRED`);
  return raw;
}

/** No writes. With confirmed=true, require exact DB and role identity. */
export async function preflightDevelopmentCreditAcceptance(raw, { confirmed = true } = {}) {
  checkUrl(raw);
  if (confirmed && process.env.CREDIT_ACCEPTANCE_RUN !== "V12I4_VERIFIED_DEVELOPMENT_DATABASE") {
    throw Error("DEV_ACCEPTANCE_EXPLICIT_RUN_APPROVAL_REQUIRED");
  }
  const expectedDb = confirmed ? expectedIdentifier(process.env.CREDIT_ACCEPTANCE_CONFIRMED_DATABASE, "DEV_ACCEPTANCE_CONFIRMED_DATABASE") : null;
  const expectedRole = confirmed ? expectedIdentifier(process.env.CREDIT_ACCEPTANCE_CONFIRMED_ROLE, "DEV_ACCEPTANCE_CONFIRMED_ROLE") : null;
  const pool = new Pool({ connectionString: raw, max: 1, connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 1000, statement_timeout: 9000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      try {
        const { rows: [identity] } = await client.query(`
          SELECT current_database() AS database,
                 current_user AS db_role,
                 current_schema() AS schema,
                 pg_is_in_recovery() AS replica,
                 current_setting('transaction_read_only') AS readonly,
                 current_setting('default_transaction_read_only') AS default_readonly,
                 inet_server_addr()::text AS server_address,
                 inet_server_port() AS server_port,
                 pg_postmaster_start_time()::text AS server_started_at,
                 to_regclass('public."User"') IS NOT NULL AS has_user,
                 to_regclass('public."TutoringRequest"') IS NOT NULL AS has_request,
                 to_regclass('public."TutoringCreditLedgerEntry"') IS NOT NULL AS has_tutoring,
                 to_regclass('public."AiCreditWallet"') IS NOT NULL AS has_wallet,
                 to_regclass('public."AiCreditLot"') IS NOT NULL AS has_lot,
                 to_regclass('public."AiCreditReservation"') IS NOT NULL AS has_reservation
        `);
        if (!identity || identity.schema !== "public" || identity.readonly !== "on" ||
          identity.default_readonly !== "off" || identity.replica || !identity.has_user ||
          !identity.has_request || !identity.has_tutoring || !identity.has_wallet ||
          !identity.has_lot || !identity.has_reservation) {
          throw Error("DEV_ACCEPTANCE_SCHEMA_OR_DB_NOT_READY");
        }
        if (confirmed && (identity.database !== expectedDb || identity.db_role !== expectedRole)) {
          throw Error("DEV_ACCEPTANCE_CONFIRMED_IDENTITY_MISMATCH");
        }
        await client.query("ROLLBACK");
        return { ok: true, database: identity.database, role: identity.db_role,
          serverAddress: identity.server_address, serverPort: identity.server_port,
          serverStartedAt: identity.server_started_at };
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const inspected = await preflightDevelopmentCreditAcceptance(selectedDevDatabaseUrl(),
      { confirmed: !process.argv.includes("--inspect") });
    console.log(`CREDIT_DEV_PREFLIGHT_PASS database=${inspected.database} role=${inspected.role} writes=NO`);
    if (process.argv.includes("--inspect")) {
      console.log("READ_ONLY_INSPECTION: Independently verify this is the intended DEVELOPMENT database before authorizing test writes.");
    }
  } catch (error) {
    console.error(`CREDIT_DEV_PREFLIGHT_REFUSED reason=${error instanceof Error ? error.message : "UNKNOWN"}`);
    process.exitCode = 1;
  }
}
