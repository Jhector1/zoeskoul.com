import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  getTutoringCreditRefundProvenance,
  type TutoringCreditRefundProvenanceDb,
} from "@/lib/tutoring/tutoringCreditRefundProvenance";

type RefundRecord = {
  id: string;
  purchaseId: string;
  userId: string;
  refundAttemptId: string;
  minutes: number;
  amountMinor: number;
  currency: string;
  stripeRefundId: string | null;
  status: string;
};

type RefundPurchaseRecord = {
  id: string;
  userId: string;
  packageMinutes: number;
  amountMinor: number;
  currency: string;
  stripePaymentIntentId: string | null;
  status: string;
};

type LedgerRecord = {
  id: string;
  userId: string;
  kind: string;
  availableMinutesDelta: number;
  reservedMinutesDelta: number;
  purchaseId: string | null;
  requestId: string | null;
  bookingId: string | null;
  idempotencyKey: string;
};

type RefundTx = TutoringCreditRefundProvenanceDb & {
  tutoringCreditRefund:
    TutoringCreditRefundProvenanceDb["tutoringCreditRefund"] & {
      findUnique(
        args: unknown,
      ): Promise<RefundRecord | null>;
      findFirst(
        args: unknown,
      ): Promise<RefundRecord | null>;
      create(
        args: unknown,
      ): Promise<RefundRecord>;
      update(
        args: unknown,
      ): Promise<RefundRecord>;
    };
  tutoringCreditPurchase:
    TutoringCreditRefundProvenanceDb["tutoringCreditPurchase"] & {
      findUnique(
        args: unknown,
      ): Promise<RefundPurchaseRecord | null>;
      update(
        args: unknown,
      ): Promise<RefundPurchaseRecord>;
    };
  tutoringCreditLedgerEntry:
    TutoringCreditRefundProvenanceDb["tutoringCreditLedgerEntry"] & {
      findUnique(
        args: unknown,
      ): Promise<LedgerRecord | null>;
      create(
        args: unknown,
      ): Promise<LedgerRecord>;
      aggregate(
        args: unknown,
      ): Promise<{
        _sum: {
          availableMinutesDelta:
            number | null;
        };
      }>;
    };
};

type RefundDb = RefundTx & {
  $transaction<T>(
    operation:
      (tx: RefundTx) =>
        Promise<T>,
    options?: {
      isolationLevel?:
        "Serializable";
    },
  ): Promise<T>;
};

export type TutoringCreditRefundErrorCode =
  | "INVALID_REFUND"
  | "REFUND_NOT_AVAILABLE"
  | "REFUND_PURCHASE_NOT_FOUND"
  | "REFUND_ATTEMPT_MISMATCH"
  | "REFUND_PAYMENT_UNAVAILABLE"
  | "REFUND_RETRY_REQUIRED";

export class TutoringCreditRefundError
  extends Error {
  readonly code:
    TutoringCreditRefundErrorCode;

  constructor(
    code:
      TutoringCreditRefundErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      "TutoringCreditRefundError";
    this.code = code;
  }
}

export type TutoringCreditRefundRequestResult = {
  kind:
    | "refund_pending"
    | "refund_already_succeeded";
  refundId: string;
  status: string;
  minutes: number;
  amountMinor: number;
  currency: string;
};

function refundDb():
  RefundDb {
  return prisma as unknown as
    RefundDb;
}

function isSerializableRetry(
  error: unknown,
): boolean {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }

  const code =
    "code" in error
      ? String(error.code)
      : "";

  return code === "P2034";
}

async function serializable<T>(
  db: RefundDb,
  operation:
    (tx: RefundTx) =>
      Promise<T>,
): Promise<T> {
  let lastError:
    unknown;

  for (
    let attempt = 0;
    attempt < 3;
    attempt += 1
  ) {
    try {
      return await db.$transaction(
        operation,
        {
          isolationLevel:
            "Serializable",
        },
      );
    } catch (error) {
      lastError = error;

      if (
        !isSerializableRetry(
          error,
        ) ||
        attempt === 2
      ) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function isTutoringRefundAttemptId(
  value: unknown,
): value is string {
  return (
    typeof value ===
      "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function assertPositiveMinutes(
  minutes: number,
) {
  if (
    !Number.isSafeInteger(
      minutes,
    ) ||
    minutes <= 0
  ) {
    throw new TutoringCreditRefundError(
      "INVALID_REFUND",
      "Refund minutes must be a positive whole number.",
    );
  }
}

function amountForMinutes(
  purchase: {
    packageMinutes: number;
    amountMinor: number;
  },
  minutes: number,
): number {
  if (
    !Number.isSafeInteger(
      purchase.packageMinutes,
    ) ||
    purchase.packageMinutes <=
      0 ||
    !Number.isSafeInteger(
      purchase.amountMinor,
    ) ||
    purchase.amountMinor <= 0
  ) {
    throw new TutoringCreditRefundError(
      "REFUND_PAYMENT_UNAVAILABLE",
      "Tutoring purchase pricing snapshot is invalid.",
    );
  }

  const amount =
    Math.floor(
      (
        purchase.amountMinor *
        minutes
      ) /
        purchase.packageMinutes,
    );

  if (
    !Number.isSafeInteger(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new TutoringCreditRefundError(
      "REFUND_PAYMENT_UNAVAILABLE",
      "Tutoring refund amount is invalid.",
    );
  }

  return amount;
}

function expandableId(
  value:
    | string
    | { id: string }
    | null
    | undefined,
): string | null {
  if (
    typeof value ===
      "string"
  ) {
    return value;
  }

  return value?.id ??
    null;
}

function assertStripeRefundMatches(
  refund: Stripe.Refund,
  expected: {
    refundId: string;
    refundAttemptId: string;
    purchaseId: string;
    userId: string;
    paymentIntentId: string;
    minutes: number;
    amountMinor: number;
    currency: string;
  },
) {
  if (
    refund.amount !==
      expected.amountMinor ||
    refund.currency
      .toLowerCase() !==
      expected.currency
        .toLowerCase() ||
    expandableId(
      refund.payment_intent,
    ) !==
      expected.paymentIntentId ||
    refund.metadata
      ?.refundKind !==
      "tutoring_credit" ||
    refund.metadata
      ?.refundId !==
      expected.refundId ||
    refund.metadata
      ?.refundAttemptId !==
      expected.refundAttemptId ||
    refund.metadata
      ?.purchaseId !==
      expected.purchaseId ||
    refund.metadata
      ?.userId !==
      expected.userId ||
    refund.metadata
      ?.minutes !==
      String(
        expected.minutes,
      ) ||
    refund.metadata
      ?.amountMinor !==
      String(
        expected.amountMinor,
      )
  ) {
    throw new TutoringCreditRefundError(
      "REFUND_PAYMENT_UNAVAILABLE",
      "Stripe refund does not match the recorded tutoring refund request.",
    );
  }
}


function stripeStatusCode(
  error: unknown,
): number | null {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return null;
  }

  const direct =
    "statusCode" in error
      ? Number(
          error.statusCode,
        )
      : Number.NaN;

  if (
    Number.isInteger(
      direct,
    )
  ) {
    return direct;
  }

  const raw =
    "raw" in error &&
    error.raw &&
    typeof error.raw ===
      "object"
      ? error.raw
      : null;

  const nested =
    raw &&
    "statusCode" in raw
      ? Number(
          raw.statusCode,
        )
      : Number.NaN;

  return Number.isInteger(
    nested,
  )
    ? nested
    : null;
}

export function isDefinitiveStripeRefundCreateFailure(
  error: unknown,
): boolean {
  const statusCode =
    stripeStatusCode(
      error,
    );

  return Boolean(
    statusCode &&
      statusCode >= 400 &&
      statusCode < 500,
  );
}

async function markTutoringCreditRefundCreateFailed(
  db: RefundDb,
  refundId: string,
): Promise<void> {
  await serializable(
    db,
    async (tx) => {
      const refund =
        await tx
          .tutoringCreditRefund
          .findUnique({
            where: {
              id:
                refundId,
            },
          });

      if (
        !refund ||
        refund.status ===
          "succeeded" ||
        refund.status ===
          "failed" ||
        refund.status ===
          "canceled" ||
        refund.stripeRefundId
      ) {
        return;
      }

      await tx
        .tutoringCreditRefund
        .update({
          where: {
            id:
              refund.id,
          },
          data: {
            status:
              "failed",
            failedAt:
              new Date(),
            failureReason:
              "Stripe rejected refund creation.",
          },
        });
    },
  );
}

type PreparedRefund = {
  refund: RefundRecord;
  purchase:
    RefundPurchaseRecord;
};

async function prepareRefund(
  args: {
    userId: string;
    refundAttemptId: string;
    purchaseId: string;
    minutes: number;
  },
  db: RefundDb,
): Promise<PreparedRefund> {
  return serializable(
    db,
    async (tx) => {
      const existing =
        await tx
          .tutoringCreditRefund
          .findUnique({
            where: {
              refundAttemptId:
                args
                  .refundAttemptId,
            },
          });

      if (existing) {
        if (
          existing.userId !==
            args.userId ||
          existing.purchaseId !==
            args.purchaseId ||
          existing.minutes !==
            args.minutes
        ) {
          throw new TutoringCreditRefundError(
            "REFUND_ATTEMPT_MISMATCH",
            "This refund attempt was already used for a different request.",
          );
        }

        const purchase =
          await tx
            .tutoringCreditPurchase
            .findUnique({
              where: {
                id:
                  existing
                    .purchaseId,
              },
            });

        if (!purchase) {
          throw new TutoringCreditRefundError(
            "REFUND_PURCHASE_NOT_FOUND",
            "Tutoring credit purchase was not found.",
          );
        }

        return {
          refund:
            existing,
          purchase,
        };
      }


      const recoverable =
        await tx
          .tutoringCreditRefund
          .findFirst({
            where: {
              userId:
                args.userId,
              purchaseId:
                args.purchaseId,
              minutes:
                args.minutes,
              status:
                "pending",
              stripeRefundId:
                null,
            },
            orderBy: {
              createdAt:
                "asc",
            },
          });

      if (recoverable) {
        const purchase =
          await tx
            .tutoringCreditPurchase
            .findUnique({
              where: {
                id:
                  recoverable
                    .purchaseId,
              },
            });

        if (
          !purchase ||
          purchase.userId !==
            args.userId
        ) {
          throw new TutoringCreditRefundError(
            "REFUND_PURCHASE_NOT_FOUND",
            "Tutoring credit purchase was not found.",
          );
        }

        return {
          refund:
            recoverable,
          purchase,
        };
      }

      const provenance =
        await getTutoringCreditRefundProvenance(
          args.userId,
          {
            db: tx,
          },
        );

      const refundable =
        provenance
          .purchases
          .find(
            (purchase) =>
              purchase
                .purchaseId ===
              args.purchaseId,
          );

      if (!refundable) {
        throw new TutoringCreditRefundError(
          "REFUND_PURCHASE_NOT_FOUND",
          "Tutoring credit purchase was not found.",
        );
      }

      if (
        args.minutes >
        refundable
          .refundableMinutes
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_NOT_AVAILABLE",
          `Only ${refundable.refundableMinutes} unused minutes from this purchase are currently refundable.`,
        );
      }

      const purchase =
        await tx
          .tutoringCreditPurchase
          .findUnique({
            where: {
              id:
                args.purchaseId,
            },
          });

      if (
        !purchase ||
        purchase.userId !==
          args.userId
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_PURCHASE_NOT_FOUND",
          "Tutoring credit purchase was not found.",
        );
      }

      if (
        purchase.status !==
          "paid" &&
        purchase.status !==
          "refunded"
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_NOT_AVAILABLE",
          "This tutoring purchase is not refundable.",
        );
      }

      if (
        !purchase
          .stripePaymentIntentId
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_PAYMENT_UNAVAILABLE",
          "The original tutoring payment cannot be refunded automatically.",
        );
      }

      const amountMinor =
        amountForMinutes(
          purchase,
          args.minutes,
        );

      const refund =
        await tx
          .tutoringCreditRefund
          .create({
            data: {
              purchaseId:
                purchase.id,
              userId:
                args.userId,
              refundAttemptId:
                args
                  .refundAttemptId,
              minutes:
                args.minutes,
              amountMinor,
              currency:
                purchase.currency
                  .toLowerCase(),
              status:
                "pending",
              meta: {
                paymentIntentId:
                  purchase
                    .stripePaymentIntentId,
              },
            },
          });

      return {
        refund,
        purchase,
      };
    },
  );
}

export async function requestTutoringCreditRefund(
  args: {
    userId: string;
    refundAttemptId: string;
    purchaseId: string;
    minutes: number;
  },
  options: {
    db?: RefundDb;
    stripe?: Stripe;
  } = {},
): Promise<TutoringCreditRefundRequestResult> {
  if (
    !isTutoringRefundAttemptId(
      args.refundAttemptId,
    )
  ) {
    throw new TutoringCreditRefundError(
      "INVALID_REFUND",
      "Refund attempt ID is invalid.",
    );
  }

  if (
    !args.purchaseId.trim()
  ) {
    throw new TutoringCreditRefundError(
      "INVALID_REFUND",
      "Tutoring purchase ID is required.",
    );
  }

  assertPositiveMinutes(
    args.minutes,
  );

  const db =
    options.db ??
    refundDb();

  const prepared =
    await prepareRefund(
      args,
      db,
    );

  if (
    prepared.refund
      .status ===
      "succeeded"
  ) {
    return {
      kind:
        "refund_already_succeeded",
      refundId:
        prepared.refund.id,
      status:
        prepared.refund.status,
      minutes:
        prepared.refund
          .minutes,
      amountMinor:
        prepared.refund
          .amountMinor,
      currency:
        prepared.refund
          .currency,
    };
  }

  if (
    prepared.refund
      .status ===
      "failed" ||
    prepared.refund
      .status ===
      "canceled"
  ) {
    throw new TutoringCreditRefundError(
      "REFUND_NOT_AVAILABLE",
      "This refund attempt is already closed. Start a new refund request.",
    );
  }

  const paymentIntentId =
    prepared.purchase
      .stripePaymentIntentId;

  if (!paymentIntentId) {
    throw new TutoringCreditRefundError(
      "REFUND_PAYMENT_UNAVAILABLE",
      "The original tutoring payment cannot be refunded automatically.",
    );
  }

  if (
    prepared.refund
      .stripeRefundId
  ) {
    return {
      kind:
        "refund_pending",
      refundId:
        prepared.refund.id,
      status:
        prepared.refund.status,
      minutes:
        prepared.refund
          .minutes,
      amountMinor:
        prepared.refund
          .amountMinor,
      currency:
        prepared.refund
          .currency,
    };
  }

  let stripe:
    Stripe;

  try {
    stripe =
      options.stripe ??
      getStripe();
  } catch {
    await markTutoringCreditRefundCreateFailed(
      db,
      prepared.refund.id,
    );

    throw new TutoringCreditRefundError(
      "REFUND_PAYMENT_UNAVAILABLE",
      "Tutoring refunds are temporarily unavailable. No tutoring minutes were refunded.",
    );
  }

  let stripeRefund:
    Stripe.Refund;

  try {
    stripeRefund =
      await stripe.refunds.create(
        {
          payment_intent:
            paymentIntentId,
          amount:
            prepared.refund
              .amountMinor,
          reason:
            "requested_by_customer",
          metadata: {
            refundKind:
              "tutoring_credit",
            refundId:
              prepared.refund.id,
            refundAttemptId:
              prepared.refund
                .refundAttemptId,
            purchaseId:
              prepared.purchase.id,
            userId:
              prepared.refund
                .userId,
            minutes:
              String(
                prepared.refund
                  .minutes,
              ),
            amountMinor:
              String(
                prepared.refund
                  .amountMinor,
              ),
            currency:
              prepared.refund
                .currency
                .toLowerCase(),
          },
        },
        {
          idempotencyKey:
            `zoeskoul-tutoring-refund:${prepared.refund.refundAttemptId}`,
        },
      );
  } catch (error) {
    if (
      isDefinitiveStripeRefundCreateFailure(
        error,
      )
    ) {
      await markTutoringCreditRefundCreateFailed(
        db,
        prepared.refund.id,
      );

      throw new TutoringCreditRefundError(
        "REFUND_PAYMENT_UNAVAILABLE",
        "Stripe did not accept this refund. No tutoring minutes were refunded; you can try again.",
      );
    }

    throw new TutoringCreditRefundError(
      "REFUND_RETRY_REQUIRED",
      "Stripe did not confirm whether the refund was created. Retry this refund; ZoeSkoul will safely reuse the existing refund attempt.",
    );
  }

  assertStripeRefundMatches(
    stripeRefund,
    {
      refundId:
        prepared.refund.id,
      refundAttemptId:
        prepared.refund
          .refundAttemptId,
      purchaseId:
        prepared.purchase.id,
      userId:
        prepared.refund
          .userId,
      paymentIntentId,
      minutes:
        prepared.refund
          .minutes,
      amountMinor:
        prepared.refund
          .amountMinor,
      currency:
        prepared.refund
          .currency,
    },
  );

  await db
    .tutoringCreditRefund
    .update({
      where: {
        id:
          prepared.refund.id,
      },
      data: {
        stripeRefundId:
          stripeRefund.id,
      },
    });

  return {
    kind:
      "refund_pending",
    refundId:
      prepared.refund.id,
    status:
      stripeRefund.status ??
      "pending",
    minutes:
      prepared.refund
        .minutes,
    amountMinor:
      prepared.refund
        .amountMinor,
    currency:
      prepared.refund
        .currency,
  };
}

function assertReversalMatches(
  entry: LedgerRecord,
  args: {
    userId: string;
    purchaseId: string;
    minutes: number;
  },
) {
  if (
    entry.userId !==
      args.userId ||
    entry.kind !==
      "refund_reversal" ||
    entry.availableMinutesDelta !==
      -args.minutes ||
    entry.reservedMinutesDelta !==
      0 ||
    entry.purchaseId !==
      args.purchaseId
  ) {
    throw new TutoringCreditRefundError(
      "REFUND_ATTEMPT_MISMATCH",
      "Tutoring refund ledger state is inconsistent.",
    );
  }
}

export async function settleSucceededTutoringCreditRefund(
  args: {
    refundId: string;
    stripeRefundId: string;
    refundAttemptId: string;
    purchaseId: string;
    userId: string;
    paymentIntentId: string;
    minutes: number;
    amountMinor: number;
    currency: string;
    occurredAt: Date;
  },
  options: {
    db?: RefundDb;
  } = {},
): Promise<{
  kind:
    | "refunded"
    | "already_refunded";
  refundId: string;
  purchaseFullyRefunded:
    boolean;
}> {
  assertPositiveMinutes(
    args.minutes,
  );

  const db =
    options.db ??
    refundDb();

  return serializable(
    db,
    async (tx) => {
      const refund =
        await tx
          .tutoringCreditRefund
          .findUnique({
            where: {
              id:
                args.refundId,
            },
          });

      if (!refund) {
        throw new TutoringCreditRefundError(
          "REFUND_NOT_AVAILABLE",
          "Tutoring refund was not found.",
        );
      }

      if (
        refund.userId !==
          args.userId ||
        refund.purchaseId !==
          args.purchaseId ||
        refund.refundAttemptId !==
          args.refundAttemptId ||
        refund.minutes !==
          args.minutes ||
        refund.amountMinor !==
          args.amountMinor ||
        refund.currency
          .toLowerCase() !==
          args.currency
            .toLowerCase() ||
        (
          refund.stripeRefundId &&
          refund.stripeRefundId !==
            args.stripeRefundId
        )
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_ATTEMPT_MISMATCH",
          "Stripe refund does not match the recorded tutoring refund.",
        );
      }

      const purchase =
        await tx
          .tutoringCreditPurchase
          .findUnique({
            where: {
              id:
                args.purchaseId,
            },
          });

      if (
        !purchase ||
        purchase.userId !==
          args.userId ||
        purchase
          .stripePaymentIntentId !==
          args.paymentIntentId
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_PAYMENT_UNAVAILABLE",
          "Stripe refund does not match the original tutoring purchase.",
        );
      }

      const reversalKey =
        `tutoring:refund:${refund.id}:reversal`;

      const existingReversal =
        await tx
          .tutoringCreditLedgerEntry
          .findUnique({
            where: {
              idempotencyKey:
                reversalKey,
            },
          });

      if (existingReversal) {
        assertReversalMatches(
          existingReversal,
          {
            userId:
              args.userId,
            purchaseId:
              args.purchaseId,
            minutes:
              args.minutes,
          },
        );
      }

      if (
        refund.status ===
          "succeeded"
      ) {
        if (
          !existingReversal
        ) {
          throw new TutoringCreditRefundError(
            "REFUND_ATTEMPT_MISMATCH",
            "Completed tutoring refund is missing its ledger reversal.",
          );
        }

        return {
          kind:
            "already_refunded",
          refundId:
            refund.id,
          purchaseFullyRefunded:
            purchase.status ===
            "refunded",
        };
      }

      if (
        refund.status ===
          "failed" ||
        refund.status ===
          "canceled"
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_NOT_AVAILABLE",
          "A closed tutoring refund cannot be marked succeeded.",
        );
      }

      const provenance =
        await getTutoringCreditRefundProvenance(
          args.userId,
          {
            db: tx,
          },
        );

      const purchaseView =
        provenance
          .purchases
          .find(
            (item) =>
              item.purchaseId ===
              args.purchaseId,
          );

      if (
        !purchaseView ||
        purchaseView
          .availablePurchasedMinutes <
          args.minutes
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_NOT_AVAILABLE",
          "Purchased tutoring minutes are no longer available for this refund.",
        );
      }

      if (!existingReversal) {
        await tx
          .tutoringCreditLedgerEntry
          .create({
            data: {
              userId:
                args.userId,
              kind:
                "refund_reversal",
              availableMinutesDelta:
                -args.minutes,
              reservedMinutesDelta:
                0,
              purchaseId:
                args.purchaseId,
              idempotencyKey:
                reversalKey,
              meta: {
                tutoringCreditRefundId:
                  refund.id,
                stripeRefundId:
                  args.stripeRefundId,
                amountMinor:
                  args.amountMinor,
                currency:
                  args.currency
                    .toLowerCase(),
              },
            },
          });
      }

      await tx
        .tutoringCreditRefund
        .update({
          where: {
            id:
              refund.id,
          },
          data: {
            stripeRefundId:
              args.stripeRefundId,
            status:
              "succeeded",
            succeededAt:
              args.occurredAt,
            failedAt: null,
            canceledAt: null,
            failureReason: null,
          },
        });

      const totals =
        await tx
          .tutoringCreditLedgerEntry
          .aggregate({
            where: {
              userId:
                args.userId,
              purchaseId:
                args.purchaseId,
              kind:
                "refund_reversal",
            },
            _sum: {
              availableMinutesDelta:
                true,
            },
          });

      const refundedMinutes =
        -(
          totals._sum
            .availableMinutesDelta ??
          0
        );

      const fullyRefunded =
        refundedMinutes >=
        purchase
          .packageMinutes;

      if (fullyRefunded) {
        await tx
          .tutoringCreditPurchase
          .update({
            where: {
              id:
                purchase.id,
            },
            data: {
              status:
                "refunded",
              refundedAt:
                args.occurredAt,
            },
          });
      }

      return {
        kind:
          "refunded",
        refundId:
          refund.id,
        purchaseFullyRefunded:
          fullyRefunded,
      };
    },
  );
}

export async function updateTutoringCreditRefundStatus(
  args: {
    refundId: string;
    stripeRefundId: string;
    refundAttemptId: string;
    purchaseId: string;
    userId: string;
    paymentIntentId: string;
    minutes: number;
    amountMinor: number;
    currency: string;
    status:
      | "pending"
      | "requires_action"
      | "failed"
      | "canceled";
    occurredAt: Date;
    failureReason?:
      string | null;
  },
  options: {
    db?: RefundDb;
  } = {},
): Promise<{
  refundId: string;
  status: string;
}> {
  const db =
    options.db ??
    refundDb();

  return serializable(
    db,
    async (tx) => {
      const refund =
        await tx
          .tutoringCreditRefund
          .findUnique({
            where: {
              id:
                args.refundId,
            },
          });

      if (!refund) {
        throw new TutoringCreditRefundError(
          "REFUND_NOT_AVAILABLE",
          "Tutoring refund was not found.",
        );
      }

      const purchase =
        await tx
          .tutoringCreditPurchase
          .findUnique({
            where: {
              id:
                args.purchaseId,
            },
          });

      if (
        refund.userId !==
          args.userId ||
        refund.purchaseId !==
          args.purchaseId ||
        refund.refundAttemptId !==
          args.refundAttemptId ||
        refund.minutes !==
          args.minutes ||
        refund.amountMinor !==
          args.amountMinor ||
        refund.currency
          .toLowerCase() !==
          args.currency
            .toLowerCase() ||
        (
          refund.stripeRefundId &&
          refund.stripeRefundId !==
            args.stripeRefundId
        ) ||
        !purchase ||
        purchase.userId !==
          args.userId ||
        purchase
          .stripePaymentIntentId !==
          args.paymentIntentId
      ) {
        throw new TutoringCreditRefundError(
          "REFUND_ATTEMPT_MISMATCH",
          "Stripe refund does not match the recorded tutoring refund.",
        );
      }

      if (
        refund.status ===
          "succeeded"
      ) {
        return {
          refundId:
            refund.id,
          status:
            refund.status,
        };
      }

      const data:
        Record<
          string,
          unknown
        > = {
          stripeRefundId:
            args.stripeRefundId,
          status:
            args.status,
        };

      if (
        args.status ===
          "failed"
      ) {
        data.failedAt =
          args.occurredAt;
        data.failureReason =
          args.failureReason ??
          "Stripe refund failed.";
      }

      if (
        args.status ===
          "canceled"
      ) {
        data.canceledAt =
          args.occurredAt;
      }

      await tx
        .tutoringCreditRefund
        .update({
          where: {
            id:
              refund.id,
          },
          data,
        });

      return {
        refundId:
          refund.id,
        status:
          args.status,
      };
    },
  );
}
