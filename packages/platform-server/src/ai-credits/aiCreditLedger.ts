import { Prisma, type PrismaClient } from "@zoeskoul/db";
import {
  AiCreditError, allocateAiCreditUnits, nonnegativeInteger, positiveInteger,
  providerNanoUsdToCreditUnits, validateCreditConversion,
  type AiCreditConversion,
} from "./creditMath";
import {projectBuilderCreditLotBalance} from "../credits/creditLedgerCore";
import {splitCreditReservationAllocation,assertCreditSettlementCovered} from "../credits/creditTransactionCore";

/**
 * Trusted server-side ledger API. Never expose grant/reserve/settle as an
 * unauthenticated route, and never trust caller-supplied usage from a browser.
 * Reservations MUST precede paid model invocations. Provider uncertainty keeps
 * reservations held for reconciliation; it does not authorize a free release.
 */
const MAX_ID = 160;
type Tx = Prisma.TransactionClient;
type ClientInput = Readonly<{ client: PrismaClient; userId: string; now?: Date }>;

function required(value: string, label: string, maximum = MAX_ID): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new AiCreditError(`INVALID_${label}`);
  return normalized;
}
function atTime(value?: Date): Date {
  const now = value ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new AiCreditError("INVALID_TIME");
  return now;
}
function eventKey(prefix: string, id: string, lotId?: string): string {
  return [prefix, id, lotId].filter(Boolean).join(":");
}
async function lockWallet(tx: Tx, userId: string) {
  // Native INSERT ... ON CONFLICT DO NOTHING avoids the read/insert race of
  // Prisma upsert on a never-before-seen wallet. A competing first writer waits
  // for the other transaction and then locks the same committed wallet row.
  await tx.aiCreditWallet.createMany({ data: [{ userId }], skipDuplicates: true });
  await tx.$queryRaw`SELECT "userId" FROM "AiCreditWallet" WHERE "userId" = ${userId} FOR UPDATE`;
}
async function ledger(tx: Tx, input: {
  userId: string; lotId: string; reservationId?: string;
  eventKey: string; kind: "grant" | "reserve" | "consume" | "release" | "expire" | "reverse";
  availableDelta?: bigint; reservedDelta?: bigint;
  consumedDelta?: bigint; expiredDelta?: bigint; reversedDelta?: bigint;
  costUsdNano?: string; pricingVersionId?: string;
}) {
  await tx.aiCreditLedgerEntry.create({
    data: {
      userId: input.userId, lotId: input.lotId, reservationId: input.reservationId,
      eventKey: input.eventKey, kind: input.kind,
      availableDelta: input.availableDelta ?? 0n,
      reservedDelta: input.reservedDelta ?? 0n,
      consumedDelta: input.consumedDelta ?? 0n,
      expiredDelta: input.expiredDelta ?? 0n,
      reversedDelta: input.reversedDelta ?? 0n,
      costUsdNano: input.costUsdNano, pricingVersionId: input.pricingVersionId,
    },
  });
}
async function expireLocked(tx: Tx, userId: string, now: Date) {
  const due = await tx.aiCreditLot.findMany({
    where: { userId, expiresAt: { lte: now }, availableUnits: { gt: 0n } },
  });
  for (const lot of due) {
    await tx.aiCreditLot.update({
      where: { id: lot.id },
      data: { availableUnits: { decrement: lot.availableUnits }, expiredUnits: { increment: lot.availableUnits } },
    });
    await ledger(tx, {
      userId, lotId: lot.id, eventKey: eventKey("expire", lot.id), kind: "expire",
      availableDelta: -lot.availableUnits, expiredDelta: lot.availableUnits,
    });
  }
}

/** Funding must follow verified recurring billing or a confirmed Stripe payment. */
export async function grantAiCreditLot(input: ClientInput & Readonly<{
  sourceKey: string; kind: "subscription" | "purchased";
  origin: "verified-subscription-period" | "verified-stripe-payment";
  units: string; expiresAt: Date | null;
}>) {
  const userId = required(input.userId, "USER");
  const sourceKey = required(input.sourceKey, "SOURCE");
  if ((input.kind === "subscription") !== (input.origin === "verified-subscription-period")) {
    throw new AiCreditError("SOURCE_KIND_MISMATCH");
  }
  const units = positiveInteger(input.units, "GRANT");
  const now = atTime(input.now);
  if (input.kind === "subscription" && (!input.expiresAt || input.expiresAt <= now)) {
    throw new AiCreditError("INVALID_SUBSCRIPTION_EXPIRY");
  }
  if (input.expiresAt && !Number.isFinite(input.expiresAt.getTime())) {
    throw new AiCreditError("INVALID_EXPIRY");
  }
  return input.client.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const existing = await tx.aiCreditLot.findUnique({ where: { sourceKey } });
    if (existing) {
      if (existing.userId !== userId || existing.kind !== input.kind || existing.grantedUnits !== units ||
          existing.expiresAt?.getTime() !== input.expiresAt?.getTime()) {
        throw new AiCreditError("GRANT_KEY_CONFLICT");
      }
      return { id: existing.id, created: false };
    }
    const wallet = await tx.aiCreditWallet.findUnique({where: {userId}, select: {riskFrozenAt: true}});
    if (wallet?.riskFrozenAt) throw new AiCreditError("AI_CREDIT_WALLET_RISK_FROZEN");
    const lot = await tx.aiCreditLot.create({
      data: { userId, sourceKey, kind: input.kind, grantedUnits: units,
        availableUnits: units, expiresAt: input.expiresAt },
    });
    await ledger(tx, { userId, lotId: lot.id, kind: "grant",
      eventKey: eventKey("grant", sourceKey), availableDelta: units });
    return { id: lot.id, created: true };
  });
}

export async function reserveAiCredits(input: ClientInput & Readonly<{
  idempotencyKey: string;
  maximumUnits: string;
  pricingVersionId: string;
  conversion: AiCreditConversion;
}>) {
  const userId = required(input.userId, "USER");
  const idempotencyKey = required(input.idempotencyKey, "RESERVATION_KEY");
  const maximumUnits = positiveInteger(input.maximumUnits, "RESERVATION");
  const pricingVersionId = required(input.pricingVersionId, "PRICE_VERSION");
  const conversion = validateCreditConversion(input.conversion);
  const now = atTime(input.now);
  return input.client.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const prior = await tx.aiCreditReservation.findUnique({ where: { idempotencyKey } });
    if (prior) {
      if (prior.userId !== userId || prior.maximumUnits !== maximumUnits ||
          prior.pricingVersionId !== pricingVersionId ||
          prior.conversionVersionId !== input.conversion.versionId ||
          prior.creditUnitsPerCredit !== conversion.creditUnitsPerCredit ||
          prior.creditValueUsdNano !== conversion.creditValueUsdNano ||
          prior.markupNumerator !== conversion.markupNumerator ||
          prior.markupDenominator !== conversion.markupDenominator) {
        throw new AiCreditError("RESERVATION_KEY_CONFLICT");
      }
      return { id: prior.id, status: prior.status, created: false };
    }
    const wallet = await tx.aiCreditWallet.findUnique({where: {userId}, select: {riskFrozenAt: true}});
    if (wallet?.riskFrozenAt) throw new AiCreditError("AI_CREDIT_WALLET_RISK_FROZEN");
    await expireLocked(tx, userId, now);
    const lots = await tx.aiCreditLot.findMany({
      where: { userId, availableUnits: { gt: 0n }, OR: [ { expiresAt: null }, { expiresAt: { gt: now } } ] },
    });
    const allocations = allocateAiCreditUnits(lots, maximumUnits, now);
    const reservation = await tx.aiCreditReservation.create({
      data: {
        userId, idempotencyKey, maximumUnits, pricingVersionId,
        conversionVersionId: input.conversion.versionId,
        ...conversion,
      },
    });
    for (const allocation of allocations) {
      await tx.aiCreditLot.update({ where: { id: allocation.lotId },
        data: { availableUnits: { decrement: allocation.units }, reservedUnits: { increment: allocation.units } } });
      await tx.aiCreditReservationAllocation.create({
        data: { reservationId: reservation.id, lotId: allocation.lotId, reservedUnits: allocation.units },
      });
      await ledger(tx, { userId, lotId: allocation.lotId, reservationId: reservation.id,
        eventKey: eventKey("reserve", reservation.id, allocation.lotId), kind: "reserve",
        availableDelta: -allocation.units, reservedDelta: allocation.units,
        pricingVersionId });
    }
    return { id: reservation.id, status: "reserved" as const, created: true };
  });
}

async function finalize(input: ClientInput & Readonly<{
  idempotencyKey: string; status: "settled" | "released";
  costUsdNano?: string; pricingVersionId?: string;
  /** Only the internal recovery entrypoint may enable this trusted-receipt branch. */
  recoverRecordedReceipt?: true;
}>) {
  const userId = required(input.userId, "USER");
  const idempotencyKey = required(input.idempotencyKey, "RESERVATION_KEY");
  const now = atTime(input.now);
  const fromReceipt = input.recoverRecordedReceipt === true;
  const requestedPrice = fromReceipt ? null : required(input.pricingVersionId!, "PRICE_VERSION");
  const requestedCost = fromReceipt ? null : nonnegativeInteger(input.costUsdNano!, "COST").toString();
  return input.client.$transaction(async (tx) => {
    await lockWallet(tx, userId);
    const reservation = await tx.aiCreditReservation.findUnique({
      where: { idempotencyKey }, include: { allocations: { include: { lot: true } } },
    });
    if (!reservation || reservation.userId !== userId) throw new AiCreditError("RESERVATION_NOT_FOUND");
    let pricingVersionId = requestedPrice;
    let costUsdNano = requestedCost;
    if (fromReceipt) {
      // The user supplies NO price, amount, or claimed evidence to this path.
      // Values are retrieved under the SAME wallet lock as the finalization.
      const receipt = await tx.aiCreditProviderRequest.findUnique({
        where: { reservationId: reservation.id },
        select: { provider: true, providerResponseId: true, clientRequestId: true,
          requestSha256: true, receiptPricingVersionId: true,
          receiptCostUsdNano: true, receiptUsageSha256: true },
      });
      if (!receipt || receipt.provider !== "openai" ||
          !receipt.providerResponseId || !receipt.clientRequestId ||
          !/^[a-f0-9]{64}$/.test(receipt.requestSha256) ||
          !receipt.receiptUsageSha256 || !/^[a-f0-9]{64}$/.test(receipt.receiptUsageSha256) ||
          !receipt.receiptPricingVersionId || receipt.receiptCostUsdNano === null) {
        throw new AiCreditError("TRUSTED_PROVIDER_RECEIPT_MISSING");
      }
      pricingVersionId = required(receipt.receiptPricingVersionId, "PRICE_VERSION");
      costUsdNano = nonnegativeInteger(receipt.receiptCostUsdNano, "COST").toString();
    }
    if (pricingVersionId === null || costUsdNano === null)
      throw new AiCreditError("SETTLEMENT_RECEIPT_REQUIRED");
    if (reservation.pricingVersionId !== pricingVersionId) throw new AiCreditError("PRICING_VERSION_MISMATCH");
    if (reservation.status !== "reserved") {
      if (reservation.status === input.status && reservation.actualCostUsdNano === costUsdNano)
        return { id: reservation.id, settledUnits: reservation.settledUnits.toString(), created: false };
      throw new AiCreditError("ALREADY_FINALIZED");
    }
    const conversion: AiCreditConversion = {
      versionId: reservation.conversionVersionId,
      creditUnitsPerCredit: reservation.creditUnitsPerCredit.toString(),
      creditValueUsdNano: reservation.creditValueUsdNano.toString(),
      markupNumerator: reservation.markupNumerator.toString(),
      markupDenominator: reservation.markupDenominator.toString(),
    };
    const charge = providerNanoUsdToCreditUnits(costUsdNano, conversion);
    if (charge > reservation.maximumUnits) {
      // Keep the entire original reservation held for financial reconciliation.
      throw new AiCreditError("SETTLEMENT_EXCEEDS_RESERVED");
    }
    if (input.status === "released" && (charge !== 0n || costUsdNano !== "0"))
      throw new AiCreditError("NONZERO_RELEASE");
    let remaining = charge;
    const allocations = [...reservation.allocations].sort((a, b) => {
      if (a.lot.kind !== b.lot.kind) return a.lot.kind === "subscription" ? -1 : 1;
      const expiry = (a.lot.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.lot.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
      return expiry || a.lot.createdAt.getTime() - b.lot.createdAt.getTime() || a.lotId.localeCompare(b.lotId);
    });
    for (const allocation of allocations) {
      const split=splitCreditReservationAllocation({reservedUnits:allocation.reservedUnits,remainingCharge:remaining});
      const {consumed,released}=split;
      remaining=split.remainingCharge;
      const expired = allocation.lot.expiresAt !== null && allocation.lot.expiresAt <= now;
      // A payment frozen by a verified refund may have a pending clawback.
      // Newly released held units are reversed in THIS transaction, before
      // becoming spendable. Already consumed units are never altered.
      const shortfall = allocation.lot.kind === "purchased"
        ? allocation.lot.reversalShortfallUnits : 0n;
      const reverseOnRelease = !expired && released > 0n && shortfall > 0n
        ? (released < shortfall ? released : shortfall) : 0n;
      await tx.aiCreditLot.update({ where: { id: allocation.lotId }, data: {
        reservedUnits: { decrement: allocation.reservedUnits },
        ...(consumed > 0n ? { consumedUnits: { increment: consumed } } : {}),
        ...(released > 0n ? expired
          ? { expiredUnits: { increment: released } }
          : { availableUnits: { increment: released - reverseOnRelease } } : {}),
        ...(reverseOnRelease > 0n ? {
          reversedUnits: { increment: reverseOnRelease },
          reversalShortfallUnits: { decrement: reverseOnRelease },
        } : {}),
      } });
      await tx.aiCreditReservationAllocation.update({
        where: { reservationId_lotId: { reservationId: reservation.id, lotId: allocation.lotId } },
        data: { consumedUnits: consumed, releasedUnits: released },
      });
      if (consumed > 0n) await ledger(tx, {
        userId, lotId: allocation.lotId, reservationId: reservation.id,
        eventKey: eventKey("consume", reservation.id, allocation.lotId), kind: "consume",
        reservedDelta: -consumed, consumedDelta: consumed,
        costUsdNano, pricingVersionId,
      });
      if (released > 0n) await ledger(tx, {
        userId, lotId: allocation.lotId, reservationId: reservation.id,
        eventKey: eventKey("release", reservation.id, allocation.lotId), kind: "release",
        reservedDelta: -released,
        ...(expired ? { expiredDelta: released } : { availableDelta: released - reverseOnRelease }),
        ...(reverseOnRelease > 0n ? { reversedDelta: reverseOnRelease } : {}),
        pricingVersionId,
      });
    }
    // Corrupt/incomplete allocations cannot charge unreserved units; roll back
    // the same transaction, including all prior lot and ledger mutations.
    assertCreditSettlementCovered(remaining);
    if (fromReceipt) {
      // The audit and wallet deltas commit or roll back together, never apart.
      await tx.aiCreditReconciliationCase.createMany({
        data: [{ reservationId: reservation.id, userId }], skipDuplicates: true,
      });
      const heldCase = await tx.aiCreditReconciliationCase.findUnique({
        where: { reservationId: reservation.id }, select: { id: true, userId: true },
      });
      if (!heldCase || heldCase.userId !== userId)
        throw new AiCreditError("RECONCILIATION_CASE_CONFLICT");
      const audit = await tx.aiCreditReconciliationEvent.createMany({
        data: [{ caseId: heldCase.id,
          eventKey: `resolved:original-response:${reservation.id}`,
          reasonCode: "AI_RECONCILIATION_ORIGINAL_RESPONSE_SETTLED" }], skipDuplicates: true,
      });
      if (audit.count !== 1) throw new AiCreditError("RECONCILIATION_AUDIT_CONFLICT");
    }
    await tx.aiCreditReservation.update({ where: { id: reservation.id }, data: {
      status: input.status, settledUnits: charge, actualCostUsdNano: costUsdNano, settledAt: now,
    } });
    return { id: reservation.id, settledUnits: charge.toString(), created: true };
  });
}

/**
 * Persist a provider-verified Stripe refund/dispute risk under the existing
 * wallet lock. Prevent NEW grants/reservations without tampering with held
 * reservations, consumed units, or refund liability. The Stripe adapter must
 * independently retrieve the refund/dispute AND matching charge before call.
 * Never expose this internal primitive through a browser/anonymous endpoint.
 */
export async function freezeAiCreditWalletForVerifiedStripeRisk(input: Readonly<{
  client: PrismaClient;
  sourceKey: string;
  stripeEventId: string;
  kind: "refund" | "dispute";
  providerObjectId: string;
  paymentIntentId: string;
  chargeId: string;
  refundedAmountUsdMinor: number;
  // Independently retrieved Stripe Charge amount, never webhook metadata.
  chargedAmountUsdMinor: number;
  now?: Date;
}>): Promise<{kind: "frozen"; created: boolean} | {kind: "not_funded"}> {
  const sourceKey = required(input.sourceKey, "SOURCE");
  const eventId = required(input.stripeEventId, "STRIPE_EVENT");
  const objectId = required(input.providerObjectId, "PROVIDER_OBJECT");
  const paymentIntentId = required(input.paymentIntentId, "PAYMENT_INTENT");
  const chargeId = required(input.chargeId, "CHARGE");
  if (!/^stripe:zoebuild:pi:pi_[A-Za-z0-9_]+$/.test(sourceKey) ||
      sourceKey !== `stripe:zoebuild:pi:${paymentIntentId}` ||
      !/^evt_[A-Za-z0-9_]+$/.test(eventId) ||
      !/^ch_[A-Za-z0-9_]+$/.test(chargeId) ||
      (input.kind !== "refund" && input.kind !== "dispute") ||
      !(input.kind === "refund" ? /^(?:re_|ch_)[A-Za-z0-9_]+$/ : /^dp_[A-Za-z0-9_]+$/).test(objectId) ||
      !Number.isSafeInteger(input.refundedAmountUsdMinor) || input.refundedAmountUsdMinor < 0 ||
      !Number.isSafeInteger(input.chargedAmountUsdMinor) || input.chargedAmountUsdMinor <= 0 ||
      input.refundedAmountUsdMinor > input.chargedAmountUsdMinor) {
    throw new AiCreditError("STRIPE_RISK_IDENTITY_INVALID");
  }
  const now = atTime(input.now);
  // Use the original ledger-granted source identity, never Stripe metadata.
  const knownLot = await input.client.aiCreditLot.findUnique({where: {sourceKey}, select: {id: true, userId: true, kind: true}});
  if (!knownLot) return {kind: "not_funded"};
  if (knownLot.kind !== "purchased") throw new AiCreditError("STRIPE_RISK_FUNDING_CONFLICT");
  return input.client.$transaction(async tx => {
    await lockWallet(tx, knownLot.userId);
    const lot = await tx.aiCreditLot.findUnique({where: {sourceKey}, select: {id: true, userId: true, kind: true}});
    if (!lot || lot.id !== knownLot.id || lot.userId !== knownLot.userId || lot.kind !== "purchased")
      throw new AiCreditError("STRIPE_RISK_FUNDING_CONFLICT");
    const eventKey = `stripe:zoebuild:risk:${eventId}`;
    const inserted = await tx.aiCreditPaymentRiskEvent.createMany({
      data: [{eventKey, lotId: lot.id, userId: lot.userId, kind: input.kind,
        providerObjectId: objectId, paymentIntentId, chargeId,
        refundedAmountUsdMinor: BigInt(input.refundedAmountUsdMinor), observedAt: now}],
      skipDuplicates: true,
    });
    const saved = await tx.aiCreditPaymentRiskEvent.findUnique({where: {eventKey}});
    if (!saved || saved.lotId !== lot.id || saved.userId !== lot.userId ||
        saved.kind !== input.kind || saved.providerObjectId !== objectId ||
        saved.paymentIntentId !== paymentIntentId || saved.chargeId !== chargeId) {
      throw new AiCreditError("STRIPE_RISK_AUDIT_CONFLICT");
    }
    // A Stripe Charge's cumulative amount_refunded is the billing evidence.
    // Disputes remain frozen, but an open dispute is NOT a completed refund.
    if (input.kind === "refund" && input.refundedAmountUsdMinor > 0) {
      const current = await tx.aiCreditLot.findUnique({where: {id: lot.id}});
      if (!current || current.kind !== "purchased" || current.userId !== lot.userId)
        throw new AiCreditError("STRIPE_REVERSAL_LOT_CONFLICT");
      if (current.reversalTargetUnits > current.grantedUnits ||
          current.reversedUnits + current.reversalShortfallUnits !== current.reversalTargetUnits)
        throw new AiCreditError("STRIPE_REVERSAL_INVARIANT_CONFLICT");
      const chargedMinor = BigInt(input.chargedAmountUsdMinor);
      const refundedMinor = BigInt(input.refundedAmountUsdMinor);
      // Floor cumulative ratio once, not per event: no repeated rounding loss.
      const target = current.grantedUnits * refundedMinor / chargedMinor;
      if (target >= current.reversalTargetUnits) {
        const outstanding = target - current.reversedUnits;
        const apply = current.availableUnits < outstanding ? current.availableUnits : outstanding;
        const finalReversed = current.reversedUnits + apply;
        const shortfall = target - finalReversed;
        const recorded = await tx.aiCreditPaymentReversalSnapshot.createMany({
          data: [{lotId: lot.id, chargedAmountUsdMinor: chargedMinor,
            refundedAmountUsdMinor: refundedMinor, targetUnits: target,
            appliedUnits: apply, shortfallUnits: shortfall, observedAt: now}],
          skipDuplicates: true,
        });
        if (recorded.count === 0) {
          const prior = await tx.aiCreditPaymentReversalSnapshot.findUnique({
            where: {lotId_refundedAmountUsdMinor: {lotId: lot.id,
              refundedAmountUsdMinor: refundedMinor}},
          });
          if (!prior || prior.chargedAmountUsdMinor !== chargedMinor || prior.targetUnits !== target)
            throw new AiCreditError("STRIPE_REVERSAL_SNAPSHOT_CONFLICT");
          // Existing accounting snapshot cannot be applied a second time.
          if (target > current.reversalTargetUnits)
            throw new AiCreditError("STRIPE_REVERSAL_SNAPSHOT_CONFLICT");
        } else {
          await tx.aiCreditLot.update({where: {id: lot.id}, data: {
            availableUnits: {decrement: apply}, reversedUnits: {increment: apply},
            reversalTargetUnits: target, reversalShortfallUnits: shortfall,
          }});
          if (apply > 0n) await ledger(tx, {userId: lot.userId, lotId: lot.id,
            eventKey: `reverse:refund:${lot.id}:${refundedMinor}`,
            kind: "reverse", availableDelta: -apply, reversedDelta: apply});
        }
      }
    }
    // Never clear this freeze due to a later won dispute or failed refund.
    await tx.aiCreditWallet.updateMany({where: {userId: lot.userId, riskFrozenAt: null},
      data: {riskFrozenAt: now}});
    return {kind: "frozen" as const, created: inserted.count === 1};
  });
}

/** Only after a verified and priced provider response: never supply estimated costs. */
export function settleAiCredits(input: ClientInput & Readonly<{
  idempotencyKey: string;
  pricedUsage: Readonly<{ pricingVersionId: string; costUsdNano: string }>;
}>) {
  return finalize({ client: input.client, userId: input.userId, now: input.now,
    idempotencyKey: input.idempotencyKey, status: "settled",
    pricingVersionId: input.pricedUsage.pricingVersionId,
    costUsdNano: input.pricedUsage.costUsdNano });
}

/**
 * Recover a settlement only from a durable, originally received HTTPS provider
 * response which was fully validated and priced BEFORE its receipt was recorded.
 * No caller-supplied claimed cost, provider invoice, or `not_billed` flag.
 * Wallet, allocation, reservation and reconciliation audit are ONE transaction.
 * An unknown provider outcome has no trusted receipt and remains held.
 * Server-internal entrypoint ONLY; no unauthenticated or browser route.
 */
export function settleAiCreditsFromRecordedProviderReceipt(input: ClientInput & Readonly<{
  idempotencyKey: string;
}>) {
  return finalize({ ...input, status: "settled", recoverRecordedReceipt: true });
}

/** Only when the model was NOT called or provider confirmed zero billable usage. */
export function releaseUnusedAiReservation(input: ClientInput & Readonly<{
  idempotencyKey: string; pricingVersionId: string;
  providerNotBilledConfirmed: true;
}>) {
  if (input.providerNotBilledConfirmed !== true) throw new AiCreditError("RELEASE_NOT_VERIFIED");
  return finalize({ client: input.client, userId: input.userId, now: input.now,
    idempotencyKey: input.idempotencyKey, status: "released",
    costUsdNano: "0", pricingVersionId: input.pricingVersionId });
}

export async function getAiCreditBalance(input: ClientInput) {
  const userId = required(input.userId, "USER");
  const now = atTime(input.now);
  const lots = await input.client.aiCreditLot.findMany({ where: { userId } });
  return projectBuilderCreditLotBalance(lots, now);
}
