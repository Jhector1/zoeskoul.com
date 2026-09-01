import "server-only";

import { prisma } from "@/lib/prisma";

export type TutoringRefundLedgerEntry = {
  id: string;
  kind: string;
  availableMinutesDelta: number;
  reservedMinutesDelta: number;
  purchaseId: string | null;
  requestId: string | null;
  bookingId: string | null;
  createdAt: Date;
};

export type TutoringRefundPurchaseSnapshot = {
  id: string;
  packageMinutes: number;
  amountMinor: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
};

export type TutoringRefundHold = {
  purchaseId: string;
  minutes: number;
  status: string;
  stripeRefundId?: string | null;
};

export type TutoringRefundablePurchase = {
  purchaseId: string;
  purchasedMinutes: number;
  availablePurchasedMinutes: number;
  reservedPurchasedMinutes: number;
  pendingRefundMinutes: number;
  retryableRefundMinutes: number;
  refundableMinutes: number;
  refundableAmountMinor: number;
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
};

export type TutoringRefundProvenance = {
  nonCashAvailableMinutes: number;
  nonCashReservedMinutes: number;
  purchases: TutoringRefundablePurchase[];
  totalRefundableMinutes: number;
};

type PurchaseBucket = {
  purchase: TutoringRefundPurchaseSnapshot;
  available: number;
  reserved: number;
};

type AllocationPart =
  | {
      kind: "non_cash";
      minutes: number;
    }
  | {
      kind: "purchase";
      purchaseId: string;
      minutes: number;
    };

function positiveWhole(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${label} must be a positive whole number.`,
    );
  }
  return value;
}

function assertEntryShape(
  entry: TutoringRefundLedgerEntry,
  expected: {
    available: number;
    reserved: number;
  },
) {
  if (
    entry.availableMinutesDelta !==
      expected.available ||
    entry.reservedMinutesDelta !==
      expected.reserved
  ) {
    throw new Error(
      `Tutoring ledger entry ${entry.id} has an invalid ${entry.kind} delta shape.`,
    );
  }
}

function allocateAvailable(
  minutes: number,
  nonCash: {
    available: number;
    reserved: number;
  },
  purchaseOrder: string[],
  buckets: Map<string, PurchaseBucket>,
): AllocationPart[] {
  let remaining =
    positiveWhole(
      minutes,
      "Tutoring reservation minutes",
    );
  const parts: AllocationPart[] =
    [];

  const fromNonCash =
    Math.min(
      remaining,
      nonCash.available,
    );

  if (fromNonCash > 0) {
    nonCash.available -=
      fromNonCash;
    nonCash.reserved +=
      fromNonCash;
    remaining -=
      fromNonCash;
    parts.push({
      kind: "non_cash",
      minutes:
        fromNonCash,
    });
  }

  for (
    const purchaseId
    of purchaseOrder
  ) {
    if (remaining <= 0) {
      break;
    }

    const bucket =
      buckets.get(
        purchaseId,
      );

    if (!bucket) {
      continue;
    }

    const take =
      Math.min(
        remaining,
        bucket.available,
      );

    if (take <= 0) {
      continue;
    }

    bucket.available -=
      take;
    bucket.reserved +=
      take;
    remaining -=
      take;

    parts.push({
      kind: "purchase",
      purchaseId,
      minutes: take,
    });
  }

  if (remaining !== 0) {
    throw new Error(
      "Tutoring ledger reservation exceeds replayed available credit.",
    );
  }

  return parts;
}

function applyReservedAllocation(
  parts: AllocationPart[],
  nonCash: {
    available: number;
    reserved: number;
  },
  buckets: Map<string, PurchaseBucket>,
  action:
    | "release"
    | "consume",
) {
  for (const part of parts) {
    if (
      part.kind ===
      "non_cash"
    ) {
      if (
        nonCash.reserved <
        part.minutes
      ) {
        throw new Error(
          "Tutoring non-cash reserved provenance underflow.",
        );
      }

      nonCash.reserved -=
        part.minutes;

      if (
        action ===
        "release"
      ) {
        nonCash.available +=
          part.minutes;
      }

      continue;
    }

    const bucket =
      buckets.get(
        part.purchaseId,
      );

    if (
      !bucket ||
      bucket.reserved <
        part.minutes
    ) {
      throw new Error(
        `Tutoring purchase ${part.purchaseId} reserved provenance underflow.`,
      );
    }

    bucket.reserved -=
      part.minutes;

    if (
      action ===
      "release"
    ) {
      bucket.available +=
        part.minutes;
    }
  }
}

function proportionalAmount(
  amountMinor: number,
  packageMinutes: number,
  minutes: number,
): number {
  if (
    !Number.isSafeInteger(
      amountMinor,
    ) ||
    amountMinor <= 0 ||
    !Number.isSafeInteger(
      packageMinutes,
    ) ||
    packageMinutes <= 0 ||
    !Number.isSafeInteger(
      minutes,
    ) ||
    minutes < 0
  ) {
    throw new Error(
      "Tutoring purchase refund snapshot is invalid.",
    );
  }

  return Math.floor(
    (
      amountMinor *
      minutes
    ) /
      packageMinutes,
  );
}

export function replayTutoringCreditRefundProvenance(
  args: {
    entries:
      TutoringRefundLedgerEntry[];
    purchases:
      TutoringRefundPurchaseSnapshot[];
    refundHolds?: TutoringRefundHold[];
  },
): TutoringRefundProvenance {
  const purchaseById =
    new Map(
      args.purchases.map(
        (purchase) => [
          purchase.id,
          purchase,
        ],
      ),
    );

  const buckets =
    new Map<
      string,
      PurchaseBucket
    >();

  const purchaseOrder:
    string[] = [];

  const bookingAllocations =
    new Map<
      string,
      AllocationPart[]
    >();

  const nonCash = {
    available: 0,
    reserved: 0,
  };

  const entries =
    [...args.entries].sort(
      (a, b) => {
        const time =
          a.createdAt.getTime() -
          b.createdAt.getTime();

        return (
          time ||
          a.id.localeCompare(
            b.id,
          )
        );
      },
    );

  for (const entry of entries) {
    switch (entry.kind) {
      case "purchase_grant": {
        if (!entry.purchaseId) {
          throw new Error(
            `Purchase grant ${entry.id} is missing purchaseId.`,
          );
        }

        const purchase =
          purchaseById.get(
            entry.purchaseId,
          );

        if (!purchase) {
          throw new Error(
            `Purchase grant ${entry.id} references an unknown purchase.`,
          );
        }

        assertEntryShape(
          entry,
          {
            available:
              purchase.packageMinutes,
            reserved: 0,
          },
        );

        if (
          buckets.has(
            purchase.id,
          )
        ) {
          throw new Error(
            `Purchase ${purchase.id} was granted more than once during provenance replay.`,
          );
        }

        buckets.set(
          purchase.id,
          {
            purchase,
            available:
              purchase.packageMinutes,
            reserved: 0,
          },
        );
        purchaseOrder.push(
          purchase.id,
        );
        break;
      }

      case "admin_grant":
      case "plan_grant": {
        if (
          entry.availableMinutesDelta <=
            0 ||
          entry.reservedMinutesDelta !==
            0
        ) {
          throw new Error(
            `Non-cash grant ${entry.id} has an invalid delta shape.`,
          );
        }

        nonCash.available +=
          entry.availableMinutesDelta;
        break;
      }

      case "reservation": {
        const allocationKey =
          entry.requestId ??
          entry.bookingId;

        if (!allocationKey) {
          throw new Error(
            `Reservation ${entry.id} is missing requestId and bookingId.`,
          );
        }

        const minutes =
          -entry.availableMinutesDelta;

        positiveWhole(
          minutes,
          "Tutoring reservation minutes",
        );

        assertEntryShape(
          entry,
          {
            available:
              -minutes,
            reserved:
              minutes,
          },
        );

        if (
          bookingAllocations.has(
            allocationKey,
          )
        ) {
          throw new Error(
            `Reservation owner ${allocationKey} has more than one reservation during provenance replay.`,
          );
        }

        bookingAllocations.set(
          allocationKey,
          allocateAvailable(
            minutes,
            nonCash,
            purchaseOrder,
            buckets,
          ),
        );
        break;
      }

      case "reservation_release": {
        const allocationKey =
          entry.requestId ??
          entry.bookingId;

        if (!allocationKey) {
          throw new Error(
            `Reservation release ${entry.id} is missing requestId and bookingId.`,
          );
        }

        const minutes =
          entry.availableMinutesDelta;

        positiveWhole(
          minutes,
          "Tutoring reservation release minutes",
        );

        assertEntryShape(
          entry,
          {
            available:
              minutes,
            reserved:
              -minutes,
          },
        );

        const allocation =
          bookingAllocations.get(
            allocationKey,
          );

        if (!allocation) {
          throw new Error(
            `Reservation owner ${allocationKey} has no reservation allocation to release.`,
          );
        }

        const allocated =
          allocation.reduce(
            (
              total,
              part,
            ) =>
              total +
              part.minutes,
            0,
          );

        if (
          allocated !==
          minutes
        ) {
          throw new Error(
            `Reservation owner ${allocationKey} release does not match its reserved allocation.`,
          );
        }

        applyReservedAllocation(
          allocation,
          nonCash,
          buckets,
          "release",
        );

        bookingAllocations.delete(
          allocationKey,
        );
        break;
      }

      case "session_consumption": {
        const allocationKey =
          entry.requestId ??
          entry.bookingId;

        if (!allocationKey) {
          throw new Error(
            `Session consumption ${entry.id} is missing requestId and bookingId.`,
          );
        }

        const minutes =
          -entry.reservedMinutesDelta;

        positiveWhole(
          minutes,
          "Tutoring session consumption minutes",
        );

        assertEntryShape(
          entry,
          {
            available: 0,
            reserved:
              -minutes,
          },
        );

        const allocation =
          bookingAllocations.get(
            allocationKey,
          );

        if (!allocation) {
          throw new Error(
            `Reservation owner ${allocationKey} has no reservation allocation to consume.`,
          );
        }

        const allocated =
          allocation.reduce(
            (
              total,
              part,
            ) =>
              total +
              part.minutes,
            0,
          );

        if (
          allocated !==
          minutes
        ) {
          throw new Error(
            `Reservation owner ${allocationKey} consumption does not match its reserved allocation.`,
          );
        }

        applyReservedAllocation(
          allocation,
          nonCash,
          buckets,
          "consume",
        );

        bookingAllocations.delete(
          allocationKey,
        );
        break;
      }

      case "refund_reversal": {
        if (!entry.purchaseId) {
          throw new Error(
            `Refund reversal ${entry.id} is missing purchaseId.`,
          );
        }

        const minutes =
          -entry.availableMinutesDelta;

        positiveWhole(
          minutes,
          "Tutoring refund reversal minutes",
        );

        assertEntryShape(
          entry,
          {
            available:
              -minutes,
            reserved: 0,
          },
        );

        const bucket =
          buckets.get(
            entry.purchaseId,
          );

        if (
          !bucket ||
          bucket.available <
            minutes
        ) {
          throw new Error(
            `Tutoring refund reversal exceeds available purchased minutes for ${entry.purchaseId}.`,
          );
        }

        bucket.available -=
          minutes;
        break;
      }

      default:
        throw new Error(
          `Unsupported tutoring ledger kind during refund provenance replay: ${entry.kind}.`,
        );
    }
  }

  const holdsByPurchase =
    new Map<
      string,
      number
    >();

  const retryableByPurchase =
    new Map<
      string,
      number
    >();

  for (
    const hold
    of args.refundHolds ??
      []
  ) {
    if (
      hold.status !==
        "pending" &&
      hold.status !==
        "requires_action"
    ) {
      continue;
    }

    positiveWhole(
      hold.minutes,
      "Tutoring refund hold minutes",
    );

    holdsByPurchase.set(
      hold.purchaseId,
      (
        holdsByPurchase.get(
          hold.purchaseId,
        ) ??
        0
      ) +
        hold.minutes,
    );

    if (
      hold.status ===
        "pending" &&
      !hold.stripeRefundId
    ) {
      retryableByPurchase.set(
        hold.purchaseId,
        (
          retryableByPurchase.get(
            hold.purchaseId,
          ) ??
          0
        ) +
          hold.minutes,
      );
    }
  }

  const purchases =
    purchaseOrder.map(
      (purchaseId) => {
        const bucket =
          buckets.get(
            purchaseId,
          );

        if (!bucket) {
          throw new Error(
            `Tutoring purchase ${purchaseId} has no provenance bucket.`,
          );
        }

        const pending =
          holdsByPurchase.get(
            purchaseId,
          ) ??
          0;

        if (
          pending >
          bucket.available
        ) {
          throw new Error(
            `Tutoring refund holds exceed available purchased minutes for ${purchaseId}.`,
          );
        }

        const retryable =
          retryableByPurchase.get(
            purchaseId,
          ) ??
          0;

        const refundable =
          bucket.available -
          pending;

        return {
          purchaseId,
          purchasedMinutes:
            bucket.purchase
              .packageMinutes,
          availablePurchasedMinutes:
            bucket.available,
          reservedPurchasedMinutes:
            bucket.reserved,
          pendingRefundMinutes:
            pending,
          retryableRefundMinutes:
            retryable,
          refundableMinutes:
            refundable,
          refundableAmountMinor:
            proportionalAmount(
              bucket.purchase
                .amountMinor,
              bucket.purchase
                .packageMinutes,
              refundable,
            ),
          amountMinor:
            bucket.purchase
              .amountMinor,
          currency:
            bucket.purchase
              .currency
              .toLowerCase(),
          paidAt:
            bucket.purchase
              .paidAt,
        };
      },
    );

  return {
    nonCashAvailableMinutes:
      nonCash.available,
    nonCashReservedMinutes:
      nonCash.reserved,
    purchases,
    totalRefundableMinutes:
      purchases.reduce(
        (
          total,
          purchase,
        ) =>
          total +
          purchase.refundableMinutes,
        0,
      ),
  };
}

export type TutoringCreditRefundProvenanceDb = {
  tutoringCreditLedgerEntry: {
    findMany(args: unknown): Promise<TutoringRefundLedgerEntry[]>;
  };
  tutoringCreditPurchase: {
    findMany(args: unknown): Promise<TutoringRefundPurchaseSnapshot[]>;
  };
  tutoringCreditRefund: {
    findMany(args: unknown): Promise<TutoringRefundHold[]>;
  };
};

export async function getTutoringCreditRefundProvenance(
  userId: string,
  options: {
    db?: TutoringCreditRefundProvenanceDb;
  } = {},
): Promise<TutoringRefundProvenance> {
  const db =
    options.db ??
    (prisma as unknown as TutoringCreditRefundProvenanceDb);

  const [
    entries,
    purchases,
    refundHolds,
  ] = await Promise.all([
    db
      .tutoringCreditLedgerEntry
      .findMany({
        where: {
          userId,
        },
        orderBy: [
          {
            createdAt:
              "asc",
          },
          {
            id: "asc",
          },
        ],
        select: {
          id: true,
          kind: true,
          availableMinutesDelta:
            true,
          reservedMinutesDelta:
            true,
          purchaseId: true,
          requestId: true,
          bookingId: true,
          createdAt: true,
        },
      }),
    db
      .tutoringCreditPurchase
      .findMany({
        where: {
          userId,
          status: {
            in: [
              "paid",
              "refunded",
            ],
          },
        },
        orderBy: [
          {
            createdAt:
              "asc",
          },
          {
            id: "asc",
          },
        ],
        select: {
          id: true,
          packageMinutes:
            true,
          amountMinor: true,
          currency: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      }),
    db
      .tutoringCreditRefund
      .findMany({
        where: {
          userId,
          status: {
            in: [
              "pending",
              "requires_action",
            ],
          },
        },
        select: {
          purchaseId: true,
          minutes: true,
          status: true,
          stripeRefundId: true,
        },
      }),
  ]);

  return replayTutoringCreditRefundProvenance({
    entries:
      entries.map(
        (entry) => ({
          ...entry,
          kind:
            String(
              entry.kind,
            ),
        }),
      ),
    purchases,
    refundHolds:
      refundHolds.map(
        (refund) => ({
          ...refund,
          status:
            String(
              refund.status,
            ),
        }),
      ),
  });
}
