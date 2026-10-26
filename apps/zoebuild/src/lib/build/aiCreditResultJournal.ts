import type { PrismaClient } from "@zoeskoul/db";
import type { AiJsonTextResult } from "@zoeskoul/ai-json";
import { settleAiCreditsFromRecordedProviderReceipt } from "@zoeskoul/platform-server/ai-credits/ledger";
import { AI_RESULT_TTL_MS, AiCreditResultError, aiCreditResultKeyring,
  openAiCreditResult, sealAiCreditResult, type AiCreditSealedResult,
  type AiCreditResultIdentity } from "./aiCreditResultCrypto";

/** The non-financial result store must never dispatch a provider call or
 * rewrite credit lot quantities. On replay, settlement reads ONLY the original
 * provider receipt already recorded by the canonical ledger.
 */
export type AiCreditResultWrite = AiCreditResultIdentity & Readonly<{
  reservationId: string; clientRequestId: string; pricingVersionId: string;
  result: AiJsonTextResult;
}>;
export type AiCreditResultRead = Omit<AiCreditResultIdentity,"providerResponseId">;
export interface AiCreditResultJournal {
  preserve(value: AiCreditResultWrite): Promise<void>;
  restore(value: AiCreditResultRead): Promise<AiJsonTextResult | null>;
}

type StoredRow = AiCreditSealedResult & Readonly<{
  userId: string; reservationId: string; idempotencyKey: string;
  requestSha256: string; providerResponseId: string; clientRequestId: string;
  pricingVersionId: string; expiresAt: Date;
}>;

/** The model is in canonical Prisma schema and the versioned SQL proposal.
 * Parameterized Prisma raw SQL avoids mixing generated clients of different
 * schema revisions. Migration must be deployed BEFORE spending is activated.
 */
export function createPrismaAiCreditResultJournal(input: Readonly<{
  client: PrismaClient; encryptionKey: string | undefined;
  encryptionKeyV2?: string; encryptionKeyV3?: string; activeKeyId?: "v1" | "v2" | "v3";
  now?: () => Date;
}>): AiCreditResultJournal {
  const keyring=aiCreditResultKeyring({v1:input.encryptionKey,
    v2:input.encryptionKeyV2,v3:input.encryptionKeyV3,activeKeyId:input.activeKeyId});
  const now=input.now??(()=>new Date());
  return {
    async preserve(value) {
      const sealed=sealAiCreditResult({identity:value,
        key:keyring.keys[keyring.activeKeyId]!,keyId:keyring.activeKeyId,result:value.result});
      const timestamp=now();
      const expiry=new Date(timestamp.getTime()+AI_RESULT_TTL_MS);
      if (!Number.isFinite(expiry.getTime())) throw new AiCreditResultError("AI_RESULT_TIME_INVALID");
      await input.client.$transaction(async(tx)=>{
        const reservation=await tx.aiCreditReservation.findUnique({
          where:{id:value.reservationId},
          include:{providerRequest:true},
        });
        const provider=reservation?.providerRequest;
        if (!reservation || reservation.userId!==value.userId ||
            reservation.idempotencyKey!==value.idempotencyKey || reservation.status!=="reserved" ||
            reservation.pricingVersionId!==value.pricingVersionId ||
            !provider || provider.requestSha256!==value.requestSha256 ||
            provider.clientRequestId!==value.clientRequestId ||
            provider.providerResponseId!==value.providerResponseId ||
            !provider.receiptRecordedAt ||
            provider.receiptPricingVersionId!==value.pricingVersionId ||
            !provider.receiptCostUsdNano || !provider.receiptUsageSha256)
          throw new AiCreditResultError("AI_RESULT_TRUSTED_RECEIPT_REQUIRED");
        // Unique reservation/key and immutable digest; replay cannot overwrite an
        // earlier output even if encryption nonce changes.
        await tx.$executeRaw`INSERT INTO "AiCreditResultJournal"
          ("idempotencyKey","reservationId","userId","requestSha256","providerResponseId",
           "clientRequestId","pricingVersionId","keyId","nonce","tag","ciphertext",
           "contentSha256","expiresAt")
          VALUES (${value.idempotencyKey},${value.reservationId},${value.userId},
            ${value.requestSha256},${value.providerResponseId},${value.clientRequestId},
            ${value.pricingVersionId},${sealed.keyId},${sealed.nonce},${sealed.tag},
            ${sealed.ciphertext},${sealed.contentSha256},${expiry})
          ON CONFLICT ("idempotencyKey") DO NOTHING`;
        const rows=await tx.$queryRaw<StoredRow[]>`SELECT * FROM "AiCreditResultJournal"
          WHERE "idempotencyKey"=${value.idempotencyKey}`;
        const saved=rows[0];
        if (rows.length!==1 || !saved || saved.userId!==value.userId ||
            saved.reservationId!==value.reservationId ||
            saved.requestSha256!==value.requestSha256 ||
            saved.providerResponseId!==value.providerResponseId ||
            saved.clientRequestId!==value.clientRequestId ||
            saved.pricingVersionId!==value.pricingVersionId ||
            saved.contentSha256!==sealed.contentSha256)
          throw new AiCreditResultError("AI_RESULT_IMMUTABLE_CONFLICT");
      });
    },
    async restore(value) {
      const rows=await input.client.$queryRaw<StoredRow[]>`SELECT "idempotencyKey","reservationId","userId","requestSha256",
        "providerResponseId","clientRequestId","pricingVersionId","keyId","nonce","tag",
        "ciphertext","contentSha256",("expiresAt" AT TIME ZONE 'UTC') AS "expiresAt"
        FROM "AiCreditResultJournal" WHERE "idempotencyKey"=${value.idempotencyKey}
        AND "userId"=${value.userId}`;
      if (!rows.length) return null;
      const record=rows[0];
      if(rows.length!==1 || !record || record.requestSha256!==value.requestSha256)
        throw new AiCreditResultError("AI_RESULT_REPLAY_FINGERPRINT_MISMATCH");
      if (record.expiresAt.getTime()<=now().getTime())
        throw new AiCreditResultError("AI_RESULT_EXPIRED");
      const reservation=await input.client.aiCreditReservation.findUnique({
        where:{id:record.reservationId},include:{providerRequest:true},
      });
      const provider=reservation?.providerRequest;
      if (!reservation || reservation.userId!==value.userId ||
          reservation.idempotencyKey!==value.idempotencyKey ||
          (reservation.status!=="reserved" && reservation.status!=="settled") ||
          !provider || provider.requestSha256!==value.requestSha256 ||
          provider.providerResponseId!==record.providerResponseId ||
          provider.clientRequestId!==record.clientRequestId ||
          provider.receiptPricingVersionId!==record.pricingVersionId ||
          !provider.receiptRecordedAt || !provider.receiptUsageSha256 ||
          !provider.receiptCostUsdNano)
        throw new AiCreditResultError("AI_RESULT_FINANCIAL_EVIDENCE_MISSING");
      const previousKey=keyring.keys[record.keyId as "v1" | "v2" | "v3"];
      if (!previousKey) throw new AiCreditResultError("AI_RESULT_KEY_VERSION_UNAVAILABLE");
      const output=openAiCreditResult({identity:record,key:previousKey,sealed:record});
      if (reservation.status==="reserved") {
        // Reconcile only from verified original receipt. Never recompute billable
        // usage from a browser request or decryptable text. A concurrent replay
        // settles idempotently inside the canonical wallet transaction.
        await settleAiCreditsFromRecordedProviderReceipt({client:input.client,
          userId:value.userId,idempotencyKey:value.idempotencyKey});
      }
      // A separate DB read confirms the ledger is settled; only then return.
      const final=await input.client.aiCreditReservation.findUnique({
        where:{id:record.reservationId},select:{userId:true,status:true},
      });
      if (final?.userId!==value.userId || final.status!=="settled")
        throw new AiCreditResultError("AI_RESULT_SETTLEMENT_NOT_CONFIRMED");
      return output;
    },
  };
}
