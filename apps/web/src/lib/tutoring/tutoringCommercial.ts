import "server-only";

import { prisma } from "@/lib/prisma";
import { isValidTutoringMinutes } from "@/lib/tutoring/tutoringPricing";

export type TutoringCreditGrantKind =
  | "purchase_grant"
  | "admin_grant"
  | "plan_grant";

type TutoringCreditPurchaseRecord = {
  id: string;
  userId: string;
  checkoutAttemptId: string;
  packageMinutes: number;
  amountMinor: number;
  currency: string;
  stripePriceId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  status: string;
  paidAt: Date | null;
  failedAt: Date | null;
  canceledAt: Date | null;
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

type TutoringRequestRecord = {
  id: string;
  learnerId: string;
  assignedTeacherId: string | null;
  status: string;
  requestedMinutes: number;
};

type TutoringBookingRecord = {
  id: string;
  requestId: string;
  teacherId: string | null;
  tutoringSessionId: string | null;
  startsAt: Date;
  durationMinutes: number;
  status: string;
  creditReservedAt: Date | null;
  creditConsumedAt: Date | null;
  creditReleasedAt: Date | null;
  request: {
    id: string;
    learnerId: string;
  };
};

type TeacherPoolRecord = {
  userId: string;
  priority: number;
  user: {
    roles: readonly string[];
  };
};

type SpecificTeacherPoolRecord = {
  userId: string;
  enabled: boolean;
  priority: number;
  user: {
    roles: readonly string[];
  };
};

type ExistingTeacherBooking = {
  startsAt: Date;
  durationMinutes: number;
};

export type TutoringCommercialTx = {
  tutoringCreditPurchase: {
    findUnique(args: unknown): Promise<TutoringCreditPurchaseRecord | null>;
    update(args: unknown): Promise<TutoringCreditPurchaseRecord>;
  };
  tutoringCreditLedgerEntry: {
    findUnique(args: unknown): Promise<LedgerRecord | null>;
    aggregate(args: unknown): Promise<{
      _sum: {
        availableMinutesDelta: number | null;
        reservedMinutesDelta: number | null;
      };
    }>;
    create(args: unknown): Promise<LedgerRecord>;
  };
  tutoringCreditRefund?: {
    aggregate(args: unknown): Promise<{
      _sum: {
        minutes: number | null;
      };
    }>;
  };
  tutoringRequest: {
    findUnique(args: unknown): Promise<TutoringRequestRecord | null>;
    update(args: unknown): Promise<TutoringRequestRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  tutoringBooking: {
    findUnique(args: unknown): Promise<TutoringBookingRecord | null>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
    findMany(args: unknown): Promise<ExistingTeacherBooking[]>;
    create(args: unknown): Promise<TutoringBookingRecord>;
    update(args: unknown): Promise<TutoringBookingRecord>;
  };
  tutoringTeacherPoolMember: {
    findUnique(args: unknown): Promise<SpecificTeacherPoolRecord | null>;
    findMany(args: unknown): Promise<TeacherPoolRecord[]>;
  };
  tutoringTeacherAvailabilityWindow: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
};

export type TutoringCommercialDb = TutoringCommercialTx & {
  $transaction<T>(
    fn: (tx: TutoringCommercialTx) => Promise<T>,
    options?: { isolationLevel?: "Serializable" },
  ): Promise<T>;
};

export type TutoringCreditBalance = {
  availableMinutes: number;
  reservedMinutes: number;
  totalMinutes: number;
};

export class InsufficientTutoringCreditsError extends Error {
  readonly availableMinutes: number;
  readonly requiredMinutes: number;

  constructor(availableMinutes: number, requiredMinutes: number) {
    super(
      `Insufficient tutoring credits: ${availableMinutes} available, ${requiredMinutes} required.`,
    );
    this.name = "InsufficientTutoringCreditsError";
    this.availableMinutes = availableMinutes;
    this.requiredMinutes = requiredMinutes;
  }
}

export class NoTutoringTeacherAvailableError extends Error {
  constructor() {
    super("No tutoring teacher is available for this requested time.");
    this.name = "NoTutoringTeacherAvailableError";
  }
}

export class TutoringCommercialInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutoringCommercialInvariantError";
  }
}

export class TutoringBookingTeacherMismatchError extends Error {
  constructor() {
    super("Tutoring booking is not assigned to this teacher.");
    this.name = "TutoringBookingTeacherMismatchError";
  }
}

function assertBookingTeacher(
  booking: TutoringBookingRecord,
  expectedTeacherId: string | undefined,
): void {
  if (
    expectedTeacherId &&
    booking.teacherId !== expectedTeacherId
  ) {
    throw new TutoringBookingTeacherMismatchError();
  }
}

function assertScheduledBooking(
  booking: TutoringBookingRecord,
): void {
  if (booking.status !== "scheduled") {
    throw new TutoringCommercialInvariantError(
      "Tutoring booking is no longer scheduled.",
    );
  }
}

function commercialDb(): TutoringCommercialDb {
  return prisma as unknown as TutoringCommercialDb;
}

function assertPositiveWholeMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new TutoringCommercialInvariantError(
      "Tutoring minutes must be a positive whole number.",
    );
  }
}

function assertBookingMinutes(
  minutes: number,
): void {
  if (!isValidTutoringMinutes(minutes)) {
    throw new TutoringCommercialInvariantError(
      "Tutoring bookings must use whole minutes between 30 and 720.",
    );
  }
}

function isSerializableRetry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "P2034";
}

async function serializable<T>(
  db: TutoringCommercialDb,
  operation: (tx: TutoringCommercialTx) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      lastError = error;
      if (!isSerializableRetry(error) || attempt === 2) throw error;
    }
  }

  throw lastError;
}

async function balanceWith(
  tx: TutoringCommercialTx,
  userId: string,
): Promise<TutoringCreditBalance> {
  const [
    result,
    pendingRefunds,
  ] = await Promise.all([
    tx.tutoringCreditLedgerEntry.aggregate({
      where: { userId },
      _sum: {
        availableMinutesDelta: true,
        reservedMinutesDelta: true,
      },
    }),
    tx.tutoringCreditRefund
      ? tx.tutoringCreditRefund.aggregate({
          where: {
            userId,
            status: {
              in: [
                "pending",
                "requires_action",
              ],
            },
          },
          _sum: {
            minutes: true,
          },
        })
      : Promise.resolve({
          _sum: {
            minutes: 0,
          },
        }),
  ]);

  const heldRefundMinutes =
    pendingRefunds._sum.minutes ??
    0;
  const availableMinutes =
    (result._sum.availableMinutesDelta ?? 0) -
    heldRefundMinutes;
  const reservedMinutes =
    result._sum.reservedMinutesDelta ??
    0;

  if (availableMinutes < 0) {
    throw new TutoringCommercialInvariantError(
      "Pending tutoring refunds exceed available tutoring credit.",
    );
  }

  return {
    availableMinutes,
    reservedMinutes,
    totalMinutes:
      availableMinutes +
      reservedMinutes,
  };
}

export async function getTutoringCreditBalance(
  userId: string,
  options: { db?: TutoringCommercialDb } = {},
): Promise<TutoringCreditBalance> {
  return balanceWith(options.db ?? commercialDb(), userId);
}

function assertIdempotencyMatch(
  existing: LedgerRecord,
  expected: {
    userId: string;
    kind: string;
    availableMinutesDelta: number;
    reservedMinutesDelta: number;
    purchaseId?: string | null;
    requestId?: string | null;
    bookingId?: string | null;
  },
): void {
  if (
    existing.userId !== expected.userId ||
    existing.kind !== expected.kind ||
    existing.availableMinutesDelta !== expected.availableMinutesDelta ||
    existing.reservedMinutesDelta !== expected.reservedMinutesDelta ||
    existing.purchaseId !== (expected.purchaseId ?? null) ||
    existing.requestId !== (expected.requestId ?? null) ||
    existing.bookingId !== (expected.bookingId ?? null)
  ) {
    throw new TutoringCommercialInvariantError(
      `Tutoring ledger idempotency key ${existing.idempotencyKey} was reused for a different operation.`,
    );
  }
}

export async function grantTutoringMinutes(
  args: {
    userId: string;
    minutes: number;
    kind: TutoringCreditGrantKind;
    idempotencyKey: string;
    purchaseId?: string | null;
    meta?: unknown;
  },
  options: { db?: TutoringCommercialDb } = {},
): Promise<{ entry: LedgerRecord; balance: TutoringCreditBalance }> {
  assertPositiveWholeMinutes(args.minutes);
  if (!args.idempotencyKey.trim()) {
    throw new TutoringCommercialInvariantError(
      "Tutoring credit grants require an idempotency key.",
    );
  }

  const db = options.db ?? commercialDb();

  return serializable(db, async (tx) => {
    const existing = await tx.tutoringCreditLedgerEntry.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });

    if (existing) {
      assertIdempotencyMatch(existing, {
        userId: args.userId,
        kind: args.kind,
        availableMinutesDelta: args.minutes,
        reservedMinutesDelta: 0,
        purchaseId: args.purchaseId,
      });
      return {
        entry: existing,
        balance: await balanceWith(tx, args.userId),
      };
    }

    const entry = await tx.tutoringCreditLedgerEntry.create({
      data: {
        userId: args.userId,
        kind: args.kind,
        availableMinutesDelta: args.minutes,
        reservedMinutesDelta: 0,
        purchaseId: args.purchaseId ?? null,
        idempotencyKey: args.idempotencyKey,
        meta: args.meta ?? undefined,
      },
    });

    return {
      entry,
      balance: await balanceWith(tx, args.userId),
    };
  });
}

function bookingEnd(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

function overlaps(
  startsAt: Date,
  durationMinutes: number,
  existing: ExistingTeacherBooking,
): boolean {
  const end = bookingEnd(startsAt, durationMinutes);
  const existingEnd = bookingEnd(
    existing.startsAt,
    existing.durationMinutes,
  );
  return existing.startsAt < end && existingEnd > startsAt;
}

async function teacherHasAvailability(
  tx: TutoringCommercialTx,
  teacherId: string,
  startsAt: Date,
  durationMinutes: number,
): Promise<boolean> {
  const window = await tx.tutoringTeacherAvailabilityWindow.findFirst({
    where: {
      teacherId,
      startsAt: { lte: startsAt },
      endsAt: { gte: bookingEnd(startsAt, durationMinutes) },
    },
    select: { id: true },
  });

  return Boolean(window);
}

async function assertSpecificTeacherAvailable(
  tx: TutoringCommercialTx,
  teacherId: string,
  startsAt: Date,
  durationMinutes: number,
): Promise<void> {
  const provider = await tx.tutoringTeacherPoolMember.findUnique({
    where: { userId: teacherId },
    select: {
      userId: true,
      enabled: true,
      priority: true,
      user: { select: { roles: true } },
    },
  });

  if (
    !provider?.enabled ||
    !provider.user.roles.includes("teacher") ||
    !(await teacherHasAvailability(
      tx,
      teacherId,
      startsAt,
      durationMinutes,
    ))
  ) {
    throw new NoTutoringTeacherAvailableError();
  }
}

async function chooseTeacher(
  tx: TutoringCommercialTx,
  startsAt: Date,
  durationMinutes: number,
): Promise<string> {
  const candidates = await tx.tutoringTeacherPoolMember.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      userId: true,
      priority: true,
      user: { select: { roles: true } },
    },
  });

  const earliestRelevantStart = new Date(
    startsAt.getTime() - 24 * 60 * 60_000,
  );
  const requestedEnd = bookingEnd(startsAt, durationMinutes);

  for (const candidate of candidates) {
    if (!candidate.user.roles.includes("teacher")) continue;
    if (
      !(await teacherHasAvailability(
        tx,
        candidate.userId,
        startsAt,
        durationMinutes,
      ))
    ) {
      continue;
    }

    const existing = await tx.tutoringBooking.findMany({
      where: {
        teacherId: candidate.userId,
        status: "scheduled",
        startsAt: {
          gte: earliestRelevantStart,
          lt: requestedEnd,
        },
      },
      select: {
        startsAt: true,
        durationMinutes: true,
      },
      orderBy: { startsAt: "asc" },
    });

    if (
      !existing.some((booking) =>
        overlaps(startsAt, durationMinutes, booking),
      )
    ) {
      return candidate.userId;
    }
  }

  throw new NoTutoringTeacherAvailableError();
}


async function tutoringRequestReservedMinutes(
  tx: TutoringCommercialTx,
  userId: string,
  requestId: string,
): Promise<number> {
  const result =
    await tx.tutoringCreditLedgerEntry.aggregate({
      where: {
        userId,
        requestId,
      },
      _sum: {
        availableMinutesDelta: true,
        reservedMinutesDelta: true,
      },
    });

  return result._sum.reservedMinutesDelta ?? 0;
}

export async function ensureTutoringRequestCreditsReserved(
  args: {
    requestId: string;
    learnerId: string;
    requestedMinutes: number;
  },
  options: { db?: TutoringCommercialDb } = {},
): Promise<TutoringCreditBalance> {
  assertBookingMinutes(args.requestedMinutes);

  const db = options.db ?? commercialDb();

  return serializable(db, async (tx) => {
    const request = await tx.tutoringRequest.findUnique({
      where: { id: args.requestId },
      select: {
        id: true,
        learnerId: true,
        assignedTeacherId: true,
        status: true,
        requestedMinutes: true,
      },
    });

    if (!request || request.learnerId !== args.learnerId) {
      throw new TutoringCommercialInvariantError(
        "Tutoring request was not found.",
      );
    }

    if (request.requestedMinutes !== args.requestedMinutes) {
      throw new TutoringCommercialInvariantError(
        "Tutoring request reservation duration does not match the request.",
      );
    }

    if (request.status === "completed" || request.status === "canceled") {
      throw new TutoringCommercialInvariantError(
        `Tutoring request ${request.id} cannot reserve credits from status ${request.status}.`,
      );
    }

    const key = `tutoring:request:${request.id}:reservation`;
    const existing = await tx.tutoringCreditLedgerEntry.findUnique({
      where: { idempotencyKey: key },
    });

    if (existing) {
      assertIdempotencyMatch(existing, {
        userId: request.learnerId,
        kind: "reservation",
        availableMinutesDelta: -request.requestedMinutes,
        reservedMinutesDelta: request.requestedMinutes,
        requestId: request.id,
        bookingId: null,
      });
      return balanceWith(tx, request.learnerId);
    }

    const reserved = await tutoringRequestReservedMinutes(
      tx,
      request.learnerId,
      request.id,
    );

    // Legacy requests may already own the correct reservation through a
    // booking-level ledger entry. Reuse that reservation instead of charging
    // the learner twice.
    if (reserved === request.requestedMinutes) {
      return balanceWith(tx, request.learnerId);
    }

    if (reserved !== 0) {
      throw new TutoringCommercialInvariantError(
        `Tutoring request ${request.id} has ${reserved} reserved minutes; expected 0 or ${request.requestedMinutes}.`,
      );
    }

    const balance = await balanceWith(tx, request.learnerId);
    if (balance.availableMinutes < request.requestedMinutes) {
      throw new InsufficientTutoringCreditsError(
        balance.availableMinutes,
        request.requestedMinutes,
      );
    }

    await tx.tutoringCreditLedgerEntry.create({
      data: {
        userId: request.learnerId,
        kind: "reservation",
        availableMinutesDelta: -request.requestedMinutes,
        reservedMinutesDelta: request.requestedMinutes,
        requestId: request.id,
        bookingId: null,
        idempotencyKey: key,
      },
    });

    return balanceWith(tx, request.learnerId);
  });
}

export async function releaseTutoringRequestCredits(
  args: {
    requestId: string;
    learnerId: string;
  },
  options: { db?: TutoringCommercialDb } = {},
): Promise<{
  balance: TutoringCreditBalance;
  releasedReservedMinutes: boolean;
}> {
  const db = options.db ?? commercialDb();

  return serializable(db, async (tx) => {
    const request = await tx.tutoringRequest.findUnique({
      where: { id: args.requestId },
      select: {
        id: true,
        learnerId: true,
        assignedTeacherId: true,
        status: true,
        requestedMinutes: true,
      },
    });

    if (!request || request.learnerId !== args.learnerId) {
      throw new TutoringCommercialInvariantError(
        "Tutoring request was not found.",
      );
    }

    const key = `tutoring:request:${request.id}:release`;
    const existing = await tx.tutoringCreditLedgerEntry.findUnique({
      where: { idempotencyKey: key },
    });

    if (existing) {
      assertIdempotencyMatch(existing, {
        userId: request.learnerId,
        kind: "reservation_release",
        availableMinutesDelta: request.requestedMinutes,
        reservedMinutesDelta: -request.requestedMinutes,
        requestId: request.id,
        bookingId: null,
      });
      return {
        balance: await balanceWith(tx, request.learnerId),
        releasedReservedMinutes: true,
      };
    }

    const reserved = await tutoringRequestReservedMinutes(
      tx,
      request.learnerId,
      request.id,
    );

    if (reserved === 0) {
      return {
        balance: await balanceWith(tx, request.learnerId),
        releasedReservedMinutes: false,
      };
    }

    if (reserved !== request.requestedMinutes) {
      throw new TutoringCommercialInvariantError(
        `Tutoring request ${request.id} has ${reserved} reserved minutes; expected ${request.requestedMinutes}.`,
      );
    }

    await tx.tutoringCreditLedgerEntry.create({
      data: {
        userId: request.learnerId,
        kind: "reservation_release",
        availableMinutesDelta: request.requestedMinutes,
        reservedMinutesDelta: -request.requestedMinutes,
        requestId: request.id,
        bookingId: null,
        idempotencyKey: key,
      },
    });

    return {
      balance: await balanceWith(tx, request.learnerId),
      releasedReservedMinutes: true,
    };
  });
}

export async function createTutoringBookingForRequest(
  args: {
    requestId: string;
    startsAt: Date;
    durationMinutes?: number;
    confirmedTeacherId?: string;
  },
  options: { db?: TutoringCommercialDb; now?: Date } = {},
): Promise<{
  booking: TutoringBookingRecord;
  teacherId: string;
  balance: TutoringCreditBalance;
}> {
  const db = options.db ?? commercialDb();
  const now = options.now ?? new Date();

  if (
    !(args.startsAt instanceof Date) ||
    !Number.isFinite(args.startsAt.getTime()) ||
    args.startsAt <= now
  ) {
    throw new TutoringCommercialInvariantError(
      "Tutoring bookings must start in the future.",
    );
  }

  return serializable(db, async (tx) => {
    const request = await tx.tutoringRequest.findUnique({
      where: { id: args.requestId },
      select: {
        id: true,
        learnerId: true,
        assignedTeacherId: true,
        status: true,
        requestedMinutes: true,
      },
    });

    if (!request) {
      throw new TutoringCommercialInvariantError(
        "Tutoring request was not found.",
      );
    }
    if (request.status === "completed" || request.status === "canceled") {
      throw new TutoringCommercialInvariantError(
        `Tutoring request ${request.id} is not bookable from status ${request.status}.`,
      );
    }

    const durationMinutes =
      args.durationMinutes ?? request.requestedMinutes;
    assertBookingMinutes(durationMinutes);

    const duplicateScheduled = await tx.tutoringBooking.findFirst({
      where: {
        requestId: request.id,
        status: "scheduled",
      },
      select: { id: true },
    });
    if (duplicateScheduled) {
      throw new TutoringCommercialInvariantError(
        "Tutoring request already has a scheduled booking.",
      );
    }

    const reservedBeforeScheduling =
      await tutoringRequestReservedMinutes(
        tx,
        request.learnerId,
        request.id,
      );

    if (
      reservedBeforeScheduling !== 0 &&
      reservedBeforeScheduling !== durationMinutes
    ) {
      throw new TutoringCommercialInvariantError(
        `Tutoring request ${request.id} has ${reservedBeforeScheduling} reserved minutes; expected ${durationMinutes}.`,
      );
    }

    if (reservedBeforeScheduling === 0) {
      const balance = await balanceWith(tx, request.learnerId);
      if (balance.availableMinutes < durationMinutes) {
        throw new InsufficientTutoringCreditsError(
          balance.availableMinutes,
          durationMinutes,
        );
      }
    }

    if (
      args.confirmedTeacherId &&
      request.assignedTeacherId &&
      request.assignedTeacherId !== args.confirmedTeacherId
    ) {
      throw new TutoringCommercialInvariantError(
        "Tutoring request is already assigned to another teacher.",
      );
    }

    const specificTeacherId =
      args.confirmedTeacherId ?? request.assignedTeacherId;

    const teacherId = specificTeacherId
      ? specificTeacherId
      : await chooseTeacher(tx, args.startsAt, durationMinutes);

    if (specificTeacherId) {
      await assertSpecificTeacherAvailable(
        tx,
        teacherId,
        args.startsAt,
        durationMinutes,
      );

      const conflicts = await tx.tutoringBooking.findMany({
        where: {
          teacherId,
          status: "scheduled",
          startsAt: {
            gte: new Date(args.startsAt.getTime() - 24 * 60 * 60_000),
            lt: bookingEnd(args.startsAt, durationMinutes),
          },
        },
        select: { startsAt: true, durationMinutes: true },
        orderBy: { startsAt: "asc" },
      });
      if (
        conflicts.some((booking) =>
          overlaps(args.startsAt, durationMinutes, booking),
        )
      ) {
        throw new NoTutoringTeacherAvailableError();
      }
    }

    const booking = await tx.tutoringBooking.create({
      data: {
        requestId: request.id,
        teacherId,
        startsAt: args.startsAt,
        durationMinutes,
        status: "scheduled",
        creditReservedAt: now,
      },
      include: {
        request: {
          select: {
            id: true,
            learnerId: true,
          },
        },
      },
    });

    if (reservedBeforeScheduling === 0) {
      // Backward compatibility for requests created before request-level
      // reservations existed. New requests are already reserved.
      await tx.tutoringCreditLedgerEntry.create({
        data: {
          userId: request.learnerId,
          kind: "reservation",
          availableMinutesDelta: -durationMinutes,
          reservedMinutesDelta: durationMinutes,
          requestId: request.id,
          bookingId: booking.id,
          idempotencyKey: `tutoring:booking:${booking.id}:reservation`,
        },
      });
    }

    await tx.tutoringRequest.update({
      where: { id: request.id },
      data: {
        assignedTeacherId: teacherId,
        assignedAt: request.assignedTeacherId ? undefined : now,
        scheduledAt: args.startsAt,
        status: "scheduled",
      },
      select: {
        id: true,
        learnerId: true,
        assignedTeacherId: true,
        status: true,
        requestedMinutes: true,
      },
    });

    return {
      booking,
      teacherId,
      balance: await balanceWith(tx, request.learnerId),
    };
  });
}

async function loadBooking(
  tx: TutoringCommercialTx,
  bookingId: string,
): Promise<TutoringBookingRecord> {
  const booking = await tx.tutoringBooking.findUnique({
    where: { id: bookingId },
    include: {
      request: {
        select: {
          id: true,
          learnerId: true,
        },
      },
    },
  });
  if (!booking) {
    throw new TutoringCommercialInvariantError(
      "Tutoring booking was not found.",
    );
  }
  return booking;
}

async function bookingReservedMinutes(
  tx: TutoringCommercialTx,
  booking: TutoringBookingRecord,
): Promise<number> {
  const result = await tx.tutoringCreditLedgerEntry.aggregate({
    where: {
      userId: booking.request.learnerId,
      requestId: booking.request.id,
    },
    _sum: {
      availableMinutesDelta: true,
      reservedMinutesDelta: true,
    },
  });
  return result._sum.reservedMinutesDelta ?? 0;
}

export async function consumeTutoringBookingCredits(
  bookingId: string,
  options: {
    db?: TutoringCommercialDb;
    now?: Date;
    expectedTeacherId?: string;
  } = {},
): Promise<TutoringCreditBalance> {
  const db = options.db ?? commercialDb();
  const now = options.now ?? new Date();

  return serializable(db, async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    assertBookingTeacher(booking, options.expectedTeacherId);

    const userId = booking.request.learnerId;
    const key = `tutoring:booking:${booking.id}:consumption`;

    const existing = await tx.tutoringCreditLedgerEntry.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      assertIdempotencyMatch(existing, {
        userId,
        kind: "session_consumption",
        availableMinutesDelta: 0,
        reservedMinutesDelta: -booking.durationMinutes,
        requestId: booking.request.id,
        bookingId: booking.id,
      });
      return balanceWith(tx, userId);
    }

    assertScheduledBooking(booking);

    if (!booking.tutoringSessionId) {
      throw new TutoringCommercialInvariantError(
        "Tutoring session must be prepared before the booking can be completed.",
      );
    }

    if (bookingEnd(booking.startsAt, booking.durationMinutes) > now) {
      throw new TutoringCommercialInvariantError(
        "Tutoring booking cannot be completed before its scheduled end time.",
      );
    }

    const reserved = await bookingReservedMinutes(tx, booking);
    if (reserved !== booking.durationMinutes) {
      throw new TutoringCommercialInvariantError(
        `Tutoring booking ${booking.id} has ${reserved} reserved minutes; expected ${booking.durationMinutes}.`,
      );
    }

    await tx.tutoringCreditLedgerEntry.create({
      data: {
        userId,
        kind: "session_consumption",
        availableMinutesDelta: 0,
        reservedMinutesDelta: -booking.durationMinutes,
        requestId: booking.request.id,
        bookingId: booking.id,
        idempotencyKey: key,
      },
    });

    await tx.tutoringBooking.update({
      where: { id: booking.id },
      data: {
        status: "completed",
        creditConsumedAt: now,
        completedAt: now,
      },
      include: {
        request: {
          select: {
            id: true,
            learnerId: true,
          },
        },
      },
    });

    await tx.tutoringRequest.updateMany({
      where: {
        id: booking.request.id,
        status: { not: "canceled" },
      },
      data: {
        status: "completed",
        completedAt: now,
      },
    });

    return balanceWith(tx, userId);
  });
}

export type TutoringBookingReleaseResult = {
  balance: TutoringCreditBalance;
  transitioned: boolean;
};

export async function releaseTutoringBookingCreditsDetailed(
  bookingId: string,
  options: {
    db?: TutoringCommercialDb;
    now?: Date;
    expectedTeacherId?: string;
  } = {},
): Promise<TutoringBookingReleaseResult> {
  const db = options.db ?? commercialDb();
  const now = options.now ?? new Date();

  return serializable(db, async (tx) => {
    const booking = await loadBooking(tx, bookingId);
    assertBookingTeacher(booking, options.expectedTeacherId);

    const userId = booking.request.learnerId;
    const key = `tutoring:booking:${booking.id}:release`;

    const existing = await tx.tutoringCreditLedgerEntry.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      assertIdempotencyMatch(existing, {
        userId,
        kind: "reservation_release",
        availableMinutesDelta: booking.durationMinutes,
        reservedMinutesDelta: -booking.durationMinutes,
        requestId: booking.request.id,
        bookingId: booking.id,
      });
      return {
        balance: await balanceWith(tx, userId),
        transitioned: false,
      };
    }

    assertScheduledBooking(booking);

    const reserved = await bookingReservedMinutes(tx, booking);
    if (reserved !== booking.durationMinutes) {
      throw new TutoringCommercialInvariantError(
        `Tutoring booking ${booking.id} has ${reserved} reserved minutes; expected ${booking.durationMinutes}.`,
      );
    }

    await tx.tutoringCreditLedgerEntry.create({
      data: {
        userId,
        kind: "reservation_release",
        availableMinutesDelta: booking.durationMinutes,
        reservedMinutesDelta: -booking.durationMinutes,
        requestId: booking.request.id,
        bookingId: booking.id,
        idempotencyKey: key,
      },
    });

    await tx.tutoringBooking.update({
      where: { id: booking.id },
      data: {
        status: "canceled",
        creditReleasedAt: now,
        canceledAt: now,
      },
      include: {
        request: {
          select: {
            id: true,
            learnerId: true,
          },
        },
      },
    });

    await tx.tutoringRequest.updateMany({
      where: {
        id: booking.request.id,
        status: { not: "completed" },
      },
      data: {
        status: "canceled",
        canceledAt: now,
      },
    });

    return {
      balance: await balanceWith(tx, userId),
      transitioned: true,
    };
  });
}

export async function releaseTutoringBookingCredits(
  bookingId: string,
  options: {
    db?: TutoringCommercialDb;
    now?: Date;
    expectedTeacherId?: string;
  } = {},
): Promise<TutoringCreditBalance> {
  const released = await releaseTutoringBookingCreditsDetailed(
    bookingId,
    options,
  );
  return released.balance;
}

export type SettlePaidTutoringCreditPurchaseArgs = {
  purchaseId: string;
  userId: string;
  checkoutAttemptId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string;
  packageMinutes: number;
  amountMinor: number;
  currency: string;
  stripePriceId: string | null;
  paymentChannel?: "checkout" | "saved_card";
  paidAt: Date;
};

export type TutoringCreditPurchaseSettlementResult = {
  kind: "credited" | "already_credited";
  purchaseId: string;
  balance: TutoringCreditBalance;
};

function assertPurchasePaymentEvidence(
  purchase: TutoringCreditPurchaseRecord,
  args: Omit<SettlePaidTutoringCreditPurchaseArgs, "paidAt">,
): void {
  if (
    purchase.id !== args.purchaseId ||
    purchase.userId !== args.userId ||
    purchase.checkoutAttemptId !== args.checkoutAttemptId ||
    purchase.packageMinutes !== args.packageMinutes ||
    purchase.amountMinor !== args.amountMinor ||
    purchase.currency.toLowerCase() !== args.currency.toLowerCase() ||
    (args.stripePriceId !== null &&
      purchase.stripePriceId !== null &&
      purchase.stripePriceId !== args.stripePriceId)
  ) {
    throw new TutoringCommercialInvariantError(
      "Stripe tutoring payment evidence does not match the recorded purchase.",
    );
  }

  if (
    args.checkoutSessionId &&
    purchase.stripeCheckoutSessionId &&
    purchase.stripeCheckoutSessionId !== args.checkoutSessionId
  ) {
    throw new TutoringCommercialInvariantError(
      "Stripe Checkout session does not match the recorded tutoring purchase.",
    );
  }

  if (
    purchase.stripePaymentIntentId &&
    purchase.stripePaymentIntentId !== args.paymentIntentId
  ) {
    throw new TutoringCommercialInvariantError(
      "Stripe PaymentIntent does not match the recorded tutoring purchase.",
    );
  }
}

function assertPurchaseGrantEntry(
  entry: LedgerRecord,
  purchase: TutoringCreditPurchaseRecord,
): void {
  assertIdempotencyMatch(entry, {
    userId: purchase.userId,
    kind: "purchase_grant",
    availableMinutesDelta: purchase.packageMinutes,
    reservedMinutesDelta: 0,
    purchaseId: purchase.id,
  });
}

export async function settlePaidTutoringCreditPurchase(
  args: SettlePaidTutoringCreditPurchaseArgs,
  options: { db?: TutoringCommercialDb } = {},
): Promise<TutoringCreditPurchaseSettlementResult> {
  assertPositiveWholeMinutes(args.packageMinutes);
  if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) {
    throw new TutoringCommercialInvariantError(
      "Paid tutoring purchase must have a positive integer amount.",
    );
  }
  const paymentChannel =
    args.paymentChannel ??
    "checkout";

  if (
    !args.currency.trim() ||
    !args.paymentIntentId.trim() ||
    !args.checkoutAttemptId.trim()
  ) {
    throw new TutoringCommercialInvariantError(
      "Paid tutoring purchase is missing Stripe payment identity.",
    );
  }

  if (
    paymentChannel ===
      "checkout" &&
    (
      !args.checkoutSessionId?.trim() ||
      !args.stripePriceId?.trim()
    )
  ) {
    throw new TutoringCommercialInvariantError(
      "Paid Checkout tutoring purchase must include Checkout and Stripe Price identity.",
    );
  }

  if (
    paymentChannel ===
      "saved_card" &&
    (
      args.checkoutSessionId !==
        null ||
      args.stripePriceId !==
        null
    )
  ) {
    throw new TutoringCommercialInvariantError(
      "Direct saved-card tutoring purchase must not claim Checkout or Stripe Price identity.",
    );
  }

  const db = options.db ?? commercialDb();

  return serializable(db, async (tx) => {
    const purchase = await tx.tutoringCreditPurchase.findUnique({
      where: { id: args.purchaseId },
    });
    if (!purchase) {
      throw new TutoringCommercialInvariantError(
        "Tutoring credit purchase was not found.",
      );
    }

    assertPurchasePaymentEvidence(purchase, args);

    if (
      purchase.status !== "pending" &&
      purchase.status !== "paid"
    ) {
      throw new TutoringCommercialInvariantError(
        `Tutoring credit purchase cannot be paid from status ${purchase.status}.`,
      );
    }

    const grantKey = `tutoring:purchase:${purchase.id}:grant`;
    const existingGrant = await tx.tutoringCreditLedgerEntry.findUnique({
      where: { idempotencyKey: grantKey },
    });

    if (existingGrant) {
      assertPurchaseGrantEntry(existingGrant, purchase);

      if (purchase.status !== "paid") {
        await tx.tutoringCreditPurchase.update({
          where: { id: purchase.id },
          data: {
            status: "paid",
            ...(paymentChannel === "checkout"
              ? {
                  stripeCheckoutSessionId:
                    args.checkoutSessionId,
                  stripePriceId:
                    args.stripePriceId,
                }
              : {}),
            stripePaymentIntentId: args.paymentIntentId,
            paidAt: args.paidAt,
            failedAt: null,
            canceledAt: null,
          },
        });
      }

      return {
        kind: "already_credited",
        purchaseId: purchase.id,
        balance: await balanceWith(tx, purchase.userId),
      };
    }

    await tx.tutoringCreditPurchase.update({
      where: { id: purchase.id },
      data: {
        status: "paid",
        ...(paymentChannel === "checkout"
          ? {
              stripeCheckoutSessionId:
                args.checkoutSessionId,
              stripePriceId:
                args.stripePriceId,
            }
          : {}),
        stripePaymentIntentId: args.paymentIntentId,
        paidAt: args.paidAt,
        failedAt: null,
        canceledAt: null,
      },
    });

    await tx.tutoringCreditLedgerEntry.create({
      data: {
        userId: purchase.userId,
        kind: "purchase_grant",
        availableMinutesDelta: purchase.packageMinutes,
        reservedMinutesDelta: 0,
        purchaseId: purchase.id,
        idempotencyKey: grantKey,
        meta: {
          paymentChannel,
          ...(paymentChannel === "checkout"
            ? {
                stripeCheckoutSessionId:
                  args.checkoutSessionId,
                stripePriceId:
                  args.stripePriceId,
              }
            : {}),
          stripePaymentIntentId: args.paymentIntentId,
          checkoutAttemptId: args.checkoutAttemptId,
          amountMinor: args.amountMinor,
          currency: args.currency.toLowerCase(),
        },
      },
    });

    return {
      kind: "credited",
      purchaseId: purchase.id,
      balance: await balanceWith(tx, purchase.userId),
    };
  });
}

export async function markTutoringCreditPurchaseTerminal(
  args: {
    purchaseId: string;
    userId: string;
    checkoutAttemptId: string;
    checkoutSessionId: string | null;
    paymentIntentId?: string | null;
    paymentChannel?: "checkout" | "saved_card";
    status: "failed" | "canceled";
    occurredAt: Date;
  },
  options: { db?: TutoringCommercialDb } = {},
): Promise<{ purchaseId: string; status: string }> {
  const db = options.db ?? commercialDb();

  return serializable(db, async (tx) => {
    const purchase = await tx.tutoringCreditPurchase.findUnique({
      where: { id: args.purchaseId },
    });
    if (!purchase) {
      throw new TutoringCommercialInvariantError(
        "Tutoring credit purchase was not found.",
      );
    }

    if (
      purchase.userId !== args.userId ||
      purchase.checkoutAttemptId !== args.checkoutAttemptId
    ) {
      throw new TutoringCommercialInvariantError(
        "Tutoring terminal Checkout evidence does not match the recorded purchase.",
      );
    }

    if (
      args.checkoutSessionId &&
      purchase.stripeCheckoutSessionId &&
      purchase.stripeCheckoutSessionId !== args.checkoutSessionId
    ) {
      throw new TutoringCommercialInvariantError(
        "Terminal Stripe Checkout session does not match the tutoring purchase.",
      );
    }

    if (
      args.paymentIntentId &&
      purchase.stripePaymentIntentId &&
      purchase.stripePaymentIntentId !==
        args.paymentIntentId
    ) {
      throw new TutoringCommercialInvariantError(
        "Terminal Stripe PaymentIntent does not match the tutoring purchase.",
      );
    }

    // Never downgrade a proven paid/refunded purchase because of a stale event.
    if (purchase.status === "paid" || purchase.status === "refunded") {
      return { purchaseId: purchase.id, status: purchase.status };
    }

    if (
      purchase.status !== "pending" &&
      purchase.status !== args.status
    ) {
      throw new TutoringCommercialInvariantError(
        `Tutoring credit purchase cannot transition from ${purchase.status} to ${args.status}.`,
      );
    }

    if (purchase.status !== args.status) {
      await tx.tutoringCreditPurchase.update({
        where: { id: purchase.id },
        data:
          args.status === "failed"
            ? {
                status: "failed",
                ...(args.checkoutSessionId
                  ? {
                      stripeCheckoutSessionId:
                        args.checkoutSessionId,
                    }
                  : {}),
                ...(args.paymentIntentId
                  ? {
                      stripePaymentIntentId:
                        args.paymentIntentId,
                    }
                  : {}),
                failedAt: args.occurredAt,
              }
            : {
                status: "canceled",
                ...(args.checkoutSessionId
                  ? {
                      stripeCheckoutSessionId:
                        args.checkoutSessionId,
                    }
                  : {}),
                ...(args.paymentIntentId
                  ? {
                      stripePaymentIntentId:
                        args.paymentIntentId,
                    }
                  : {}),
                canceledAt: args.occurredAt,
              },
      });
    }

    return { purchaseId: purchase.id, status: args.status };
  });
}
