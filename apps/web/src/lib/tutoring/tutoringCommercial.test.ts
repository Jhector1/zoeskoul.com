import { describe, expect, it, vi } from "vitest";

import {
  InsufficientTutoringCreditsError,
  NoTutoringTeacherAvailableError,
  consumeTutoringBookingCredits,
  createTutoringBookingForRequest,
  ensureTutoringRequestCreditsReserved,
  grantTutoringMinutes,
  releaseTutoringRequestCredits,
  releaseTutoringBookingCredits,
  releaseTutoringBookingCreditsDetailed,
  settlePaidTutoringCreditPurchase,
  markTutoringCreditPurchaseTerminal,
  type TutoringCommercialDb,
  type TutoringCommercialTx,
} from "./tutoringCommercial";

function dbFrom(tx: TutoringCommercialTx): TutoringCommercialDb {
  return {
    ...tx,
    $transaction: vi.fn(async (fn) => fn(tx)),
  };
}

function baseTx(): TutoringCommercialTx {
  return {
    tutoringCreditPurchase: {
      findUnique: vi.fn(async () => ({
        id: "purchase-1",
        userId: "learner-1",
        checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        packageMinutes: 60,
        amountMinor: 6123,
        currency: "usd",
        stripePriceId: "price_tutor_60",
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        status: "pending",
        paidAt: null,
        failedAt: null,
        canceledAt: null,
      })),
      update: vi.fn(async (args: any) => ({
        id: "purchase-1",
        userId: "learner-1",
        checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
        packageMinutes: 60,
        amountMinor: 6123,
        currency: "usd",
        stripePriceId: "price_tutor_60",
        stripeCheckoutSessionId: args.data.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: args.data.stripePaymentIntentId ?? null,
        status: args.data.status ?? "pending",
        paidAt: args.data.paidAt ?? null,
        failedAt: args.data.failedAt ?? null,
        canceledAt: args.data.canceledAt ?? null,
      })),
    },
    tutoringCreditLedgerEntry: {
      findUnique: vi.fn(async () => null),
      aggregate: vi.fn(async () => ({
        _sum: {
          availableMinutesDelta: 60,
          reservedMinutesDelta: 0,
        },
      })),
      create: vi.fn(async (args: any) => ({
        id: "ledger-1",
        userId: args.data.userId,
        kind: args.data.kind,
        availableMinutesDelta: args.data.availableMinutesDelta,
        reservedMinutesDelta: args.data.reservedMinutesDelta,
        purchaseId: args.data.purchaseId ?? null,
        requestId: args.data.requestId ?? null,
        bookingId: args.data.bookingId ?? null,
        idempotencyKey: args.data.idempotencyKey,
      })),
    },
    tutoringRequest: {
      findUnique: vi.fn(async () => ({
        id: "request-1",
        learnerId: "learner-1",
        assignedTeacherId: null,
        status: "requested",
        requestedMinutes: 30,
      })),
      update: vi.fn(async (args: any) => ({
        id: "request-1",
        learnerId: "learner-1",
        assignedTeacherId: args.data.assignedTeacherId ?? null,
        status: args.data.status ?? "requested",
        requestedMinutes: 30,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    tutoringBooking: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: any) => ({
        id: "booking-1",
        requestId: args.data.requestId,
        teacherId: args.data.teacherId,
        tutoringSessionId: args.data.tutoringSessionId ?? null,
        startsAt: args.data.startsAt,
        durationMinutes: args.data.durationMinutes,
        status: "scheduled",
        creditReservedAt: args.data.creditReservedAt ?? null,
        creditConsumedAt: null,
        creditReleasedAt: null,
        request: {
          id: "request-1",
          learnerId: "learner-1",
        },
      })),
      update: vi.fn(async (args: any) => ({
        id: "booking-1",
        requestId: "request-1",
        teacherId: "teacher-1",
        tutoringSessionId: "session-1",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        durationMinutes: 30,
        status: args.data.status,
        creditReservedAt: new Date("2026-08-27T23:00:00.000Z"),
        creditConsumedAt: args.data.creditConsumedAt ?? null,
        creditReleasedAt: args.data.creditReleasedAt ?? null,
        request: {
          id: "request-1",
          learnerId: "learner-1",
        },
      })),
    },
    tutoringTeacherPoolMember: {
      findUnique: vi.fn(async () => ({
        userId: "teacher-1",
        enabled: true,
        priority: 100,
        user: { roles: ["teacher"] },
      })),
      findMany: vi.fn(async () => [
        {
          userId: "teacher-1",
          priority: 100,
          user: { roles: ["teacher"] },
        },
      ]),
    },
    tutoringTeacherAvailabilityWindow: {
      findFirst: vi.fn(async () => ({ id: "availability-1" })),
    },
  };
}

describe("tutoring commercial credits", () => {
  it("reserves and releases waiting-request tutoring minutes", async () => {
    const tx = baseTx();

    await ensureTutoringRequestCreditsReserved(
      {
        requestId: "request-1",
        learnerId: "learner-1",
        requestedMinutes: 30,
      },
      { db: dbFrom(tx) },
    );

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        userId: "learner-1",
        kind: "reservation",
        availableMinutesDelta: -30,
        reservedMinutesDelta: 30,
        requestId: "request-1",
        bookingId: null,
        idempotencyKey: "tutoring:request:request-1:reservation",
      },
    });

    (tx.tutoringCreditLedgerEntry.aggregate as any).mockResolvedValueOnce({
      _sum: {
        availableMinutesDelta: -30,
        reservedMinutesDelta: 30,
      },
    });

    await releaseTutoringRequestCredits(
      {
        requestId: "request-1",
        learnerId: "learner-1",
      },
      { db: dbFrom(tx) },
    );

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        userId: "learner-1",
        kind: "reservation_release",
        availableMinutesDelta: 30,
        reservedMinutesDelta: -30,
        requestId: "request-1",
        bookingId: null,
        idempotencyKey: "tutoring:request:request-1:release",
      },
    });
  });

  it("grants purchased minutes exactly once for the same idempotency key", async () => {
    const tx = baseTx();
    const db = dbFrom(tx);

    const first = await grantTutoringMinutes(
      {
        userId: "learner-1",
        minutes: 60,
        kind: "purchase_grant",
        idempotencyKey: "stripe:cs_1:credit",
        purchaseId: "purchase-1",
      },
      { db },
    );

    expect(first.entry.availableMinutesDelta).toBe(60);
    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledTimes(1);

    (tx.tutoringCreditLedgerEntry.findUnique as any).mockResolvedValueOnce({
      ...first.entry,
      id: "ledger-existing",
    });

    await grantTutoringMinutes(
      {
        userId: "learner-1",
        minutes: 60,
        kind: "purchase_grant",
        idempotencyKey: "stripe:cs_1:credit",
        purchaseId: "purchase-1",
      },
      { db },
    );

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledTimes(1);
  });


  it("keeps the ledger independent from launch purchase bundle sizes", async () => {
    const tx = baseTx();

    await grantTutoringMinutes(
      {
        userId: "learner-1",
        minutes: 75,
        kind: "admin_grant",
        idempotencyKey: "admin:learner-1:75-minutes",
      },
      { db: dbFrom(tx) },
    );

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availableMinutesDelta: 75,
          reservedMinutesDelta: 0,
          kind: "admin_grant",
        }),
      }),
    );
  });

  it("auto-assigns an enabled teacher and reserves minutes when booking", async () => {
    const tx = baseTx();
    let aggregateCall = 0;
    (tx.tutoringCreditLedgerEntry.aggregate as any).mockImplementation(
      async () => {
        aggregateCall += 1;
        return aggregateCall === 1
          ? {
              _sum: {
                availableMinutesDelta: 60,
                reservedMinutesDelta: 0,
              },
            }
          : {
              _sum: {
                availableMinutesDelta: 30,
                reservedMinutesDelta: 30,
              },
            };
      },
    );

    const result = await createTutoringBookingForRequest(
      {
        requestId: "request-1",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
      },
      {
        db: dbFrom(tx),
        now: new Date("2026-08-27T23:00:00.000Z"),
      },
    );

    expect(result.teacherId).toBe("teacher-1");
    expect(result.balance).toEqual({
      availableMinutes: 30,
      reservedMinutes: 30,
      totalMinutes: 60,
    });

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "reservation",
          availableMinutesDelta: -30,
          reservedMinutesDelta: 30,
          bookingId: "booking-1",
        }),
      }),
    );
  });

  it("does not create a booking when the learner lacks credits", async () => {
    const tx = baseTx();
    (tx.tutoringCreditLedgerEntry.aggregate as any).mockResolvedValue({
      _sum: {
        availableMinutesDelta: 10,
        reservedMinutesDelta: 0,
      },
    });

    await expect(
      createTutoringBookingForRequest(
        {
          requestId: "request-1",
          startsAt: new Date("2026-09-01T15:00:00.000Z"),
        },
        { db: dbFrom(tx) },
      ),
    ).rejects.toBeInstanceOf(InsufficientTutoringCreditsError);

    expect(tx.tutoringBooking.create).not.toHaveBeenCalled();
    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("skips an overlapping teacher and assigns the next available one", async () => {
    const tx = baseTx();
    (tx.tutoringTeacherPoolMember.findMany as any).mockResolvedValue([
      {
        userId: "teacher-1",
        priority: 1,
        user: { roles: ["teacher"] },
      },
      {
        userId: "teacher-2",
        priority: 2,
        user: { roles: ["teacher"] },
      },
    ]);

    (tx.tutoringBooking.findMany as any)
      .mockResolvedValueOnce([
        {
          startsAt: new Date("2026-09-01T14:45:00.000Z"),
          durationMinutes: 60,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await createTutoringBookingForRequest(
      {
        requestId: "request-1",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
      },
      { db: dbFrom(tx) },
    );

    expect(result.teacherId).toBe("teacher-2");
  });

  it("fails instead of double-booking when no teacher is available", async () => {
    const tx = baseTx();
    (tx.tutoringBooking.findMany as any).mockResolvedValue([
      {
        startsAt: new Date("2026-09-01T14:45:00.000Z"),
        durationMinutes: 60,
      },
    ]);

    await expect(
      createTutoringBookingForRequest(
        {
          requestId: "request-1",
          startsAt: new Date("2026-09-01T15:00:00.000Z"),
        },
        { db: dbFrom(tx) },
      ),
    ).rejects.toBeInstanceOf(NoTutoringTeacherAvailableError);
  });
});

describe("tutoring booking credit settlement", () => {
  function bookedTx(): TutoringCommercialTx {
    const tx = baseTx();
    tx.tutoringBooking.findUnique = vi.fn(async () => ({
      id: "booking-1",
      requestId: "request-1",
      teacherId: "teacher-1",
      tutoringSessionId: "session-1",
      startsAt: new Date("2026-09-01T15:00:00.000Z"),
      durationMinutes: 30,
      status: "scheduled",
      creditReservedAt: new Date("2026-08-27T23:00:00.000Z"),
      creditConsumedAt: null,
      creditReleasedAt: null,
      request: {
        id: "request-1",
        learnerId: "learner-1",
      },
    }));

    let aggregateCall = 0;
    tx.tutoringCreditLedgerEntry.aggregate = vi.fn(async () => {
      aggregateCall += 1;
      if (aggregateCall === 1) {
        return {
          _sum: {
            availableMinutesDelta: -30,
            reservedMinutesDelta: 30,
          },
        };
      }
      return {
        _sum: {
          availableMinutesDelta: 30,
          reservedMinutesDelta: 0,
        },
      };
    });
    return tx;
  }

  it("consumes reserved minutes without charging available minutes twice", async () => {
    const tx = bookedTx();
    await consumeTutoringBookingCredits("booking-1", {
      db: dbFrom(tx),
      now: new Date("2026-09-01T15:30:00.000Z"),
      expectedTeacherId: "teacher-1",
    });

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "session_consumption",
          availableMinutesDelta: 0,
          reservedMinutesDelta: -30,
        }),
      }),
    );
  });

  it("releases reserved minutes back to available credits on cancellation", async () => {
    const tx = bookedTx();
    await releaseTutoringBookingCredits("booking-1", {
      db: dbFrom(tx),
      now: new Date("2026-08-31T15:00:00.000Z"),
      expectedTeacherId: "teacher-1",
    });

    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "reservation_release",
          availableMinutesDelta: 30,
          reservedMinutesDelta: -30,
        }),
      }),
    );
  });


  it("reports an idempotent replay as not newly transitioned", async () => {
    const tx = bookedTx();
    (
      tx.tutoringCreditLedgerEntry.findUnique as any
    ).mockResolvedValue({
      id: "release-entry-1",
      userId: "learner-1",
      kind: "reservation_release",
      availableMinutesDelta: 30,
      reservedMinutesDelta: -30,
      purchaseId: null,
      requestId: "request-1",
      bookingId: "booking-1",
      idempotencyKey:
        "tutoring:booking:booking-1:release",
      meta: null,
      createdAt: new Date("2026-08-31T15:00:00.000Z"),
    });
    (
      tx.tutoringCreditLedgerEntry.aggregate as any
    ).mockResolvedValue({
      _sum: {
        availableMinutesDelta: 30,
        reservedMinutesDelta: 0,
      },
    });

    const released =
      await releaseTutoringBookingCreditsDetailed(
        "booking-1",
        {
          db: dbFrom(tx),
          now: new Date("2026-08-31T15:00:00.000Z"),
          expectedTeacherId: "teacher-1",
        },
      );

    expect(released.transitioned).toBe(false);
    expect(
      tx.tutoringCreditLedgerEntry.create,
    ).not.toHaveBeenCalled();
  });

  it("rejects lifecycle mutation by a teacher who does not own the booking", async () => {
    const tx = bookedTx();

    await expect(
      consumeTutoringBookingCredits("booking-1", {
        db: dbFrom(tx),
        now: new Date("2026-09-01T15:30:00.000Z"),
        expectedTeacherId: "teacher-2",
      }),
    ).rejects.toThrow(
      "Tutoring booking is not assigned to this teacher.",
    );

    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
    expect(tx.tutoringBooking.update).not.toHaveBeenCalled();
  });

  it("does not consume credits before the scheduled tutoring time has ended", async () => {
    const tx = bookedTx();

    await expect(
      consumeTutoringBookingCredits("booking-1", {
        db: dbFrom(tx),
        now: new Date("2026-09-01T15:15:00.000Z"),
        expectedTeacherId: "teacher-1",
      }),
    ).rejects.toThrow(
      "cannot be completed before its scheduled end time",
    );

    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("requires a prepared tutoring session before completion", async () => {
    const tx = bookedTx();
    const originalFind = tx.tutoringBooking.findUnique;
    tx.tutoringBooking.findUnique = vi.fn(async (args: unknown) => {
      const booking = await originalFind(args);
      return booking
        ? { ...booking, tutoringSessionId: null }
        : null;
    });

    await expect(
      consumeTutoringBookingCredits("booking-1", {
        db: dbFrom(tx),
        now: new Date("2026-09-01T15:30:00.000Z"),
        expectedTeacherId: "teacher-1",
      }),
    ).rejects.toThrow(
      "must be prepared before the booking can be completed",
    );

    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a fresh lifecycle mutation once a booking is no longer scheduled", async () => {
    const tx = bookedTx();
    const originalFind = tx.tutoringBooking.findUnique;
    tx.tutoringBooking.findUnique = vi.fn(async (args: unknown) => {
      const booking = await originalFind(args);
      return booking
        ? { ...booking, status: "canceled" }
        : null;
    });

    await expect(
      releaseTutoringBookingCredits("booking-1", {
        db: dbFrom(tx),
        now: new Date("2026-08-31T15:00:00.000Z"),
        expectedTeacherId: "teacher-1",
      }),
    ).rejects.toThrow("no longer scheduled");

    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe("paid tutoring purchase settlement", () => {
  const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

  it("marks the purchase paid and grants its minutes atomically", async () => {
    const tx = baseTx();
    let aggregateCall = 0;
    (tx.tutoringCreditLedgerEntry.aggregate as any).mockImplementation(
      async () => {
        aggregateCall += 1;
        return {
          _sum: {
            availableMinutesDelta: aggregateCall === 1 ? 60 : 60,
            reservedMinutesDelta: 0,
          },
        };
      },
    );

    const result = await settlePaidTutoringCreditPurchase(
      {
        purchaseId: "purchase-1",
        userId: "learner-1",
        checkoutAttemptId: ATTEMPT_ID,
        checkoutSessionId: "cs_paid_1",
        paymentIntentId: "pi_paid_1",
        packageMinutes: 60,
        amountMinor: 6123,
        currency: "usd",
        stripePriceId: "price_tutor_60",
        paidAt: new Date("2026-08-28T23:00:00.000Z"),
      },
      { db: dbFrom(tx) },
    );

    expect(result.kind).toBe("credited");
    expect(tx.tutoringCreditPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "paid",
          stripeCheckoutSessionId: "cs_paid_1",
          stripePaymentIntentId: "pi_paid_1",
        }),
      }),
    );
    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "purchase_grant",
          availableMinutesDelta: 60,
          reservedMinutesDelta: 0,
          purchaseId: "purchase-1",
          idempotencyKey: "tutoring:purchase:purchase-1:grant",
        }),
      }),
    );
  });

  it("converges a second Stripe event on the same purchase grant", async () => {
    const tx = baseTx();
    (tx.tutoringCreditPurchase.findUnique as any).mockResolvedValue({
      id: "purchase-1",
      userId: "learner-1",
      checkoutAttemptId: ATTEMPT_ID,
      packageMinutes: 60,
      amountMinor: 6123,
      currency: "usd",
      stripePriceId: "price_tutor_60",
      stripeCheckoutSessionId: "cs_paid_1",
      stripePaymentIntentId: "pi_paid_1",
      status: "paid",
      paidAt: new Date("2026-08-28T23:00:00.000Z"),
      failedAt: null,
      canceledAt: null,
    });
    (tx.tutoringCreditLedgerEntry.findUnique as any).mockResolvedValue({
      id: "ledger-existing",
      userId: "learner-1",
      kind: "purchase_grant",
      availableMinutesDelta: 60,
      reservedMinutesDelta: 0,
      purchaseId: "purchase-1",
      requestId: null,
      bookingId: null,
      idempotencyKey: "tutoring:purchase:purchase-1:grant",
    });

    const result = await settlePaidTutoringCreditPurchase(
      {
        purchaseId: "purchase-1",
        userId: "learner-1",
        checkoutAttemptId: ATTEMPT_ID,
        checkoutSessionId: "cs_paid_1",
        paymentIntentId: "pi_paid_1",
        packageMinutes: 60,
        amountMinor: 6123,
        currency: "usd",
        stripePriceId: "price_tutor_60",
        paidAt: new Date("2026-08-28T23:00:05.000Z"),
      },
      { db: dbFrom(tx) },
    );

    expect(result.kind).toBe("already_credited");
    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("rejects Stripe money evidence that differs from the purchase snapshot", async () => {
    const tx = baseTx();

    await expect(
      settlePaidTutoringCreditPurchase(
        {
          purchaseId: "purchase-1",
          userId: "learner-1",
          checkoutAttemptId: ATTEMPT_ID,
          checkoutSessionId: "cs_paid_1",
          paymentIntentId: "pi_paid_1",
          packageMinutes: 60,
          amountMinor: 9999,
          currency: "usd",
          stripePriceId: "price_tutor_60",
          paidAt: new Date("2026-08-28T23:00:00.000Z"),
        },
        { db: dbFrom(tx) },
      ),
    ).rejects.toThrow(
      "Stripe tutoring payment evidence does not match the recorded purchase.",
    );

    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("marks failed/expired purchases terminal without touching credits", async () => {
    const tx = baseTx();

    await markTutoringCreditPurchaseTerminal(
      {
        purchaseId: "purchase-1",
        userId: "learner-1",
        checkoutAttemptId: ATTEMPT_ID,
        checkoutSessionId: "cs_failed_1",
        status: "failed",
        occurredAt: new Date("2026-08-28T23:05:00.000Z"),
      },
      { db: dbFrom(tx) },
    );

    expect(tx.tutoringCreditPurchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          stripeCheckoutSessionId: "cs_failed_1",
        }),
      }),
    );
    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe("teacher-confirmed tutoring scheduling", () => {
  it("books the confirming teacher only when their availability covers the full session", async () => {
    const tx = baseTx();

    const result = await createTutoringBookingForRequest(
      {
        requestId: "request-1",
        startsAt: new Date("2026-09-01T15:00:00.000Z"),
        confirmedTeacherId: "teacher-1",
      },
      {
        db: dbFrom(tx),
        now: new Date("2026-08-29T00:00:00.000Z"),
      },
    );

    expect(result.teacherId).toBe("teacher-1");
    expect(
      tx.tutoringTeacherAvailabilityWindow.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: "teacher-1",
          startsAt: { lte: new Date("2026-09-01T15:00:00.000Z") },
          endsAt: { gte: new Date("2026-09-01T15:30:00.000Z") },
        }),
      }),
    );
    expect(tx.tutoringCreditLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "reservation",
          availableMinutesDelta: -30,
          reservedMinutesDelta: 30,
        }),
      }),
    );
  });

  it("rejects a confirming teacher when no saved availability covers the slot", async () => {
    const tx = baseTx();
    (
      tx.tutoringTeacherAvailabilityWindow.findFirst as any
    ).mockResolvedValue(null);

    await expect(
      createTutoringBookingForRequest(
        {
          requestId: "request-1",
          startsAt: new Date("2026-09-01T15:00:00.000Z"),
          confirmedTeacherId: "teacher-1",
        },
        {
          db: dbFrom(tx),
          now: new Date("2026-08-29T00:00:00.000Z"),
        },
      ),
    ).rejects.toBeInstanceOf(NoTutoringTeacherAvailableError);

    expect(tx.tutoringBooking.create).not.toHaveBeenCalled();
    expect(tx.tutoringCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("does not let a second teacher take a request already assigned to someone else", async () => {
    const tx = baseTx();
    (tx.tutoringRequest.findUnique as any).mockResolvedValue({
      id: "request-1",
      learnerId: "learner-1",
      assignedTeacherId: "teacher-2",
      status: "assigned",
      requestedMinutes: 30,
    });

    await expect(
      createTutoringBookingForRequest(
        {
          requestId: "request-1",
          startsAt: new Date("2026-09-01T15:00:00.000Z"),
          confirmedTeacherId: "teacher-1",
        },
        {
          db: dbFrom(tx),
          now: new Date("2026-08-29T00:00:00.000Z"),
        },
      ),
    ).rejects.toThrow(
      "Tutoring request is already assigned to another teacher.",
    );

    expect(tx.tutoringBooking.create).not.toHaveBeenCalled();
  });

  it("refuses past start times before touching booking state", async () => {
    const tx = baseTx();

    await expect(
      createTutoringBookingForRequest(
        {
          requestId: "request-1",
          startsAt: new Date("2026-08-28T23:00:00.000Z"),
          confirmedTeacherId: "teacher-1",
        },
        {
          db: dbFrom(tx),
          now: new Date("2026-08-29T00:00:00.000Z"),
        },
      ),
    ).rejects.toThrow("must start in the future");

    expect(tx.tutoringRequest.findUnique).not.toHaveBeenCalled();
    expect(tx.tutoringBooking.create).not.toHaveBeenCalled();
  });
});
