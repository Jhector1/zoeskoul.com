import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cancelLearnerTutoringRequest,
  type TutoringLearnerCancellationDeps,
} from "./tutoringLearnerCancellation";

const BALANCE = {
  availableMinutes: 120,
  reservedMinutes: 0,
  totalMinutes: 120,
};

function deps(
  request: {
    status: string;
    booking:
      | {
          id: string;
          startsAt: Date;
          status: string;
        }
      | null;
  },
): TutoringLearnerCancellationDeps {
  return {
    findRequest: vi.fn(async () => ({
      id: "request-1",
      learnerId: "learner-1",
      status: request.status,
      booking: request.booking,
    })),
    cancelOpenRequest: vi.fn(async () => true),
    releaseBooking: vi.fn(async () => ({
      balance: BALANCE,
      transitioned: true,
    })),
    releaseOpenRequest: vi.fn(async () => ({
      balance: BALANCE,
      releasedReservedMinutes: true,
    })),
    getBalance: vi.fn(async () => BALANCE),
  };
}

describe("learner tutoring cancellation", () => {
  it("cancels a waiting request and releases its reserved credit", async () => {
    const d = deps({
      status: "requested",
      booking: null,
    });

    await expect(
      cancelLearnerTutoringRequest(
        {
          requestId: "request-1",
          learnerId: "learner-1",
        },
        {
          deps: d,
          now: new Date("2026-08-30T17:00:00.000Z"),
        },
      ),
    ).resolves.toEqual({
      status: "canceled",
      balance: BALANCE,
      releasedReservedMinutes: true,
      transitioned: true,
    });

    expect(d.releaseOpenRequest).toHaveBeenCalledWith(
      "request-1",
      "learner-1",
    );
    expect(d.releaseBooking).not.toHaveBeenCalled();
  });

  it("releases scheduled reserved minutes through the canonical booking owner", async () => {
    const d = deps({
      status: "scheduled",
      booking: {
        id: "booking-1",
        startsAt: new Date("2026-09-02T20:00:00.000Z"),
        status: "scheduled",
      },
    });

    await expect(
      cancelLearnerTutoringRequest(
        {
          requestId: "request-1",
          learnerId: "learner-1",
        },
        {
          deps: d,
          now: new Date("2026-08-30T17:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      status: "canceled",
      releasedReservedMinutes: true,
      transitioned: true,
    });

    expect(d.releaseBooking).toHaveBeenCalledWith(
      "booking-1",
      new Date("2026-08-30T17:00:00.000Z"),
    );
  });

  it("blocks dashboard cancellation after the scheduled session starts", async () => {
    const d = deps({
      status: "scheduled",
      booking: {
        id: "booking-1",
        startsAt: new Date("2026-08-30T16:00:00.000Z"),
        status: "scheduled",
      },
    });

    await expect(
      cancelLearnerTutoringRequest(
        {
          requestId: "request-1",
          learnerId: "learner-1",
        },
        {
          deps: d,
          now: new Date("2026-08-30T17:00:00.000Z"),
        },
      ),
    ).rejects.toThrow("already started");

    expect(d.releaseBooking).not.toHaveBeenCalled();
  });
});
