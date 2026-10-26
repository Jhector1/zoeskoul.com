import type { PrismaClient } from "@zoeskoul/db";

/** Durable one-to-one provider dispatch identity. Not permission to move credits. */
export class AiCreditProviderRequestError extends Error {
  constructor(readonly code: string) { super(code); this.name = "AiCreditProviderRequestError"; }
}
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RESPONSE = /^[a-zA-Z0-9][a-zA-Z0-9._:/#-]{0,159}$/;
function id(value: string, label: string): string {
  if (typeof value !== "string" || !ID.test(value))
    throw new AiCreditProviderRequestError(`AI_DISPATCH_INVALID_${label}`);
  return value;
}

/** Must commit BEFORE the paid HTTP request. No retry may create another paid dispatch. */
export async function bindAiCreditProviderRequest(input: Readonly<{
  client: PrismaClient; userId: string; reservationId: string;
  idempotencyKey: string; provider: "openai"; model: string;
  clientRequestId: string; requestSha256: string;
}>): Promise<{ id: string; created: boolean }> {
  const userId = id(input.userId, "USER");
  const reservationId = id(input.reservationId, "RESERVATION");
  const idempotencyKey = id(input.idempotencyKey, "KEY");
  const model = id(input.model, "MODEL");
  const clientRequestId = id(input.clientRequestId, "CLIENT_REQUEST");
  if (input.provider !== "openai") throw new AiCreditProviderRequestError("AI_DISPATCH_PROVIDER_UNSUPPORTED");
  if (!DIGEST.test(input.requestSha256)) throw new AiCreditProviderRequestError("AI_DISPATCH_INVALID_DIGEST");
  return input.client.$transaction(async tx => {
    const reservation = await tx.aiCreditReservation.findUnique({
      where: { id: reservationId },
      select: { userId: true, idempotencyKey: true, status: true },
    });
    if (!reservation || reservation.userId !== userId ||
        reservation.idempotencyKey !== idempotencyKey)
      throw new AiCreditProviderRequestError("AI_DISPATCH_RESERVATION_NOT_FOUND");
    if (reservation.status !== "reserved")
      throw new AiCreditProviderRequestError("AI_DISPATCH_RESERVATION_NOT_HELD");
    const data = { reservationId, provider: input.provider, model,
      clientRequestId, requestSha256: input.requestSha256 };
    const inserted = await tx.aiCreditProviderRequest.createMany({ data: [data], skipDuplicates: true });
    const existing = await tx.aiCreditProviderRequest.findUnique({
      where: { reservationId },
      select: { id: true, provider: true, model: true, clientRequestId: true, requestSha256: true },
    });
    if (!existing || existing.provider !== data.provider || existing.model !== data.model ||
        existing.clientRequestId !== data.clientRequestId ||
        existing.requestSha256 !== data.requestSha256)
      throw new AiCreditProviderRequestError("AI_DISPATCH_IDENTITY_CONFLICT");
    return { id: existing.id, created: inserted.count === 1 };
  });
}

/** Record identity obtained through the original HTTPS provider response. Not independent billing verification. */
export async function captureAiCreditProviderResponse(input: Readonly<{
  client: PrismaClient; userId: string; reservationId: string; clientRequestId: string;
  providerResponseId: string; providerHttpRequestId?: string;
  observedAt?: Date;
}>): Promise<{ captured: boolean }> {
  const userId = id(input.userId, "USER");
  const reservationId = id(input.reservationId, "RESERVATION");
  const clientRequestId = id(input.clientRequestId, "CLIENT_REQUEST");
  if (typeof input.providerResponseId !== "string" || !RESPONSE.test(input.providerResponseId))
    throw new AiCreditProviderRequestError("AI_DISPATCH_INVALID_RESPONSE_ID");
  if (input.providerHttpRequestId !== undefined && !RESPONSE.test(input.providerHttpRequestId))
    throw new AiCreditProviderRequestError("AI_DISPATCH_INVALID_HTTP_REQUEST_ID");
  const observedAt = input.observedAt ?? new Date();
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime()))
    throw new AiCreditProviderRequestError("AI_DISPATCH_INVALID_TIME");
  return input.client.$transaction(async tx => {
    const reservation = await tx.aiCreditReservation.findUnique({
      where: { id: reservationId }, select: { userId: true, status: true },
    });
    if (!reservation || reservation.userId !== userId)
      throw new AiCreditProviderRequestError("AI_DISPATCH_RESERVATION_NOT_FOUND");
    if (reservation.status !== "reserved")
      throw new AiCreditProviderRequestError("AI_DISPATCH_RESERVATION_NOT_HELD");
    // Only fill the identifiers once. Races cannot overwrite a competing response.
    const result = await tx.aiCreditProviderRequest.updateMany({
      where: { reservationId, clientRequestId, provider: "openai",
        providerResponseId: null, providerHttpRequestId: null },
      data: { providerResponseId: input.providerResponseId,
        providerHttpRequestId: input.providerHttpRequestId ?? null, observedAt },
    });
    const existing = await tx.aiCreditProviderRequest.findUnique({
      where: { reservationId },
      select: { clientRequestId: true, providerResponseId: true, providerHttpRequestId: true },
    });
    if (!existing || existing.clientRequestId !== clientRequestId ||
        existing.providerResponseId !== input.providerResponseId ||
        existing.providerHttpRequestId !== (input.providerHttpRequestId ?? null))
      throw new AiCreditProviderRequestError("AI_DISPATCH_RESPONSE_IDENTITY_CONFLICT");
    return { captured: result.count === 1 };
  });
}

/**
 * Freeze the already validated/priced usage returned by the ORIGINAL authenticated
 * HTTPS provider request. Call only after server-side provider/model/tier/usage,
 * reservation-bound ceiling and reviewed price checks have all passed.
 * This DOES NOT verify an operator-submitted invoice or a timed-out request.
 * No ledger balance changes in this function.
 */
export async function recordAiCreditPricedProviderReceipt(input: Readonly<{
  client: PrismaClient; userId: string; reservationId: string;
  clientRequestId: string; providerResponseId: string;
  pricingVersionId: string; costUsdNano: string; usageSha256: string;
  recordedAt?: Date;
}>): Promise<{ recorded: boolean }> {
  const userId = id(input.userId, "USER");
  const reservationId = id(input.reservationId, "RESERVATION");
  const clientRequestId = id(input.clientRequestId, "CLIENT_REQUEST");
  const providerResponseId = id(input.providerResponseId, "PROVIDER_RESPONSE");
  const pricingVersionId = id(input.pricingVersionId, "PRICING_VERSION");
  if (typeof input.usageSha256 !== "string" || !DIGEST.test(input.usageSha256))
    throw new AiCreditProviderRequestError("AI_RECEIPT_INVALID_DIGEST");
  if (typeof input.costUsdNano !== "string" ||
      !/^(?:0|[1-9][0-9]{0,79})$/.test(input.costUsdNano))
    throw new AiCreditProviderRequestError("AI_RECEIPT_INVALID_COST");
  const recordedAt = input.recordedAt ?? new Date();
  if (!(recordedAt instanceof Date) || !Number.isFinite(recordedAt.getTime()))
    throw new AiCreditProviderRequestError("AI_RECEIPT_INVALID_TIME");

  return input.client.$transaction(async tx => {
    const reservation = await tx.aiCreditReservation.findUnique({
      where: { id: reservationId },
      select: { userId: true, status: true, pricingVersionId: true },
    });
    if (!reservation || reservation.userId !== userId)
      throw new AiCreditProviderRequestError("AI_RECEIPT_RESERVATION_NOT_FOUND");
    if (reservation.status !== "reserved")
      throw new AiCreditProviderRequestError("AI_RECEIPT_RESERVATION_NOT_HELD");
    if (reservation.pricingVersionId !== pricingVersionId)
      throw new AiCreditProviderRequestError("AI_RECEIPT_PRICE_MISMATCH");

    const changed = await tx.aiCreditProviderRequest.updateMany({
      where: { reservationId, clientRequestId, provider: "openai", providerResponseId,
        receiptPricingVersionId: null, receiptCostUsdNano: null, receiptUsageSha256: null },
      data: { receiptPricingVersionId: pricingVersionId,
        receiptCostUsdNano: input.costUsdNano,
        receiptUsageSha256: input.usageSha256, receiptRecordedAt: recordedAt },
    });
    const found = await tx.aiCreditProviderRequest.findUnique({
      where: { reservationId },
      select: { clientRequestId: true, provider: true, providerResponseId: true,
        receiptPricingVersionId: true, receiptCostUsdNano: true, receiptUsageSha256: true },
    });
    if (!found || found.provider !== "openai" ||
        found.clientRequestId !== clientRequestId || found.providerResponseId !== providerResponseId ||
        found.receiptPricingVersionId !== pricingVersionId ||
        found.receiptCostUsdNano !== input.costUsdNano ||
        found.receiptUsageSha256 !== input.usageSha256)
      throw new AiCreditProviderRequestError("AI_RECEIPT_IDENTITY_CONFLICT");
    return { recorded: changed.count === 1 };
  });
}
