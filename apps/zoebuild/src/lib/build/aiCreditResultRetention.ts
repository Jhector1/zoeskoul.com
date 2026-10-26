import type { PrismaClient } from "@zoeskoul/db";

/** Only encrypted, expired RESULT payloads; financial records are immutable.
 * Scheduler/authorization must be supplied by the platform composition root.
 * Not called from an HTTP request or from an untrusted browser.
 */
export async function purgeExpiredAiCreditResults(input: Readonly<{
  client: PrismaClient; now?: Date; batchSize?: number;
}>): Promise<number> {
  const now=input.now??new Date();
  const batchSize=input.batchSize??100;
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(batchSize) ||
      batchSize<1 || batchSize>100)
    throw new Error("AI_RESULT_RETENTION_INPUT_INVALID");
  // Single bounded statement; concurrent schedulers do not process a row twice.
  // PostgreSQL SKIP LOCKED avoids blocking generation or another cleanup worker.
  // No financial reservation/provider receipt/ledger rows are modified.
  const rows=await input.client.$queryRaw<Array<{deleted:number}>>`
    WITH expired AS (
      SELECT "idempotencyKey" FROM "AiCreditResultJournal"
      WHERE "expiresAt" <= ${now}
      ORDER BY "expiresAt", "idempotencyKey"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "AiCreditResultJournal" j USING expired e
    WHERE j."idempotencyKey"=e."idempotencyKey"
    RETURNING 1 AS deleted`;
  if (rows.length>batchSize) throw Error("AI_RESULT_RETENTION_OVER_LIMIT");
  return rows.length;
}
