import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getTutoringCreditBalance,
  releaseTutoringBookingCreditsDetailed,
  releaseTutoringRequestCredits,
  TutoringCommercialInvariantError,
  type TutoringBookingReleaseResult,
  type TutoringCreditBalance,
} from "@/lib/tutoring/tutoringCommercial";

export type LearnerTutoringCancellationView = {
  id: string;
  learnerId: string;
  status: string;
  booking: {
    id: string;
    startsAt: Date;
    status: string;
  } | null;
};

export class LearnerTutoringRequestNotFoundError extends Error {
  constructor() {
    super("Tutoring request was not found.");
    this.name = "LearnerTutoringRequestNotFoundError";
  }
}

export type TutoringLearnerCancellationDeps = {
  findRequest(
    requestId: string,
    learnerId: string,
  ): Promise<LearnerTutoringCancellationView | null>;
  cancelOpenRequest(
    requestId: string,
    learnerId: string,
    now: Date,
  ): Promise<boolean>;
  releaseBooking(
    bookingId: string,
    now: Date,
  ): Promise<TutoringBookingReleaseResult>;
  releaseOpenRequest(
    requestId: string,
    learnerId: string,
  ): Promise<{
    balance: TutoringCreditBalance;
    releasedReservedMinutes: boolean;
  }>;
  getBalance(
    learnerId: string,
  ): Promise<TutoringCreditBalance>;
};

function defaultDeps(): TutoringLearnerCancellationDeps {
  return {
    findRequest: async (requestId, learnerId) => {
      const request = await prisma.tutoringRequest.findFirst({
        where: {
          id: requestId,
          learnerId,
        },
        select: {
          id: true,
          learnerId: true,
          status: true,
          bookings: {
            where: {
              status: "scheduled",
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              id: true,
              startsAt: true,
              status: true,
            },
          },
        },
      });

      if (!request) return null;

      return {
        id: request.id,
        learnerId: request.learnerId,
        status: request.status,
        booking: request.bookings[0] ?? null,
      };
    },
    cancelOpenRequest: async (
      requestId,
      learnerId,
      now,
    ) => {
      const result = await prisma.tutoringRequest.updateMany({
        where: {
          id: requestId,
          learnerId,
          status: {
            in: ["requested", "assigned"],
          },
        },
        data: {
          status: "canceled",
          canceledAt: now,
        },
      });

      return result.count === 1;
    },
    releaseBooking: async (bookingId, now) =>
      releaseTutoringBookingCreditsDetailed(bookingId, { now }),
    releaseOpenRequest: async (requestId, learnerId) =>
      releaseTutoringRequestCredits({ requestId, learnerId }),
    getBalance: getTutoringCreditBalance,
  };
}

export async function cancelLearnerTutoringRequest(
  args: {
    requestId: string;
    learnerId: string;
  },
  options: {
    deps?: TutoringLearnerCancellationDeps;
    now?: Date;
  } = {},
): Promise<{
  status: "canceled";
  balance: TutoringCreditBalance;
  releasedReservedMinutes: boolean;
  transitioned: boolean;
}> {
  const deps = options.deps ?? defaultDeps();
  const now = options.now ?? new Date();

  let request = await deps.findRequest(
    args.requestId,
    args.learnerId,
  );

  if (!request) {
    throw new LearnerTutoringRequestNotFoundError();
  }

  if (request.status === "completed") {
    throw new TutoringCommercialInvariantError(
      "Completed tutoring cannot be canceled.",
    );
  }

  if (request.status === "canceled") {
    return {
      status: "canceled",
      balance: await deps.getBalance(args.learnerId),
      releasedReservedMinutes: false,
      transitioned: false,
    };
  }

  if (
    request.booking &&
    request.booking.status === "scheduled"
  ) {
    if (request.booking.startsAt.getTime() <= now.getTime()) {
      throw new TutoringCommercialInvariantError(
        "This tutoring session has already started and can no longer be canceled from the learner dashboard.",
      );
    }

    const released = await deps.releaseBooking(
      request.booking.id,
      now,
    );

    return {
      status: "canceled",
      balance: released.balance,
      releasedReservedMinutes: released.transitioned,
      transitioned: released.transitioned,
    };
  }

  const canceled = await deps.cancelOpenRequest(
    args.requestId,
    args.learnerId,
    now,
  );

  if (canceled) {
    const released = await deps.releaseOpenRequest(
      args.requestId,
      args.learnerId,
    );
    return {
      status: "canceled",
      balance: released.balance,
      releasedReservedMinutes: released.releasedReservedMinutes,
      transitioned: true,
    };
  }

  // Scheduling may have won the race between the first read
  // and the open-request update. Reload and then reuse the
  // canonical booking reservation-release owner.
  request = await deps.findRequest(
    args.requestId,
    args.learnerId,
  );

  if (!request) {
    throw new LearnerTutoringRequestNotFoundError();
  }

  if (request.status === "canceled") {
    return {
      status: "canceled",
      balance: await deps.getBalance(args.learnerId),
      releasedReservedMinutes: false,
      transitioned: false,
    };
  }

  if (
    request.booking &&
    request.booking.status === "scheduled"
  ) {
    if (request.booking.startsAt.getTime() <= now.getTime()) {
      throw new TutoringCommercialInvariantError(
        "This tutoring session has already started and can no longer be canceled from the learner dashboard.",
      );
    }

    const released = await deps.releaseBooking(
      request.booking.id,
      now,
    );

    return {
      status: "canceled",
      balance: released.balance,
      releasedReservedMinutes: released.transitioned,
      transitioned: released.transitioned,
    };
  }

  throw new TutoringCommercialInvariantError(
    `Tutoring request cannot be canceled from status ${request.status}.`,
  );
}
