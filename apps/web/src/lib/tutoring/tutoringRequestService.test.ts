import { describe, expect, it, vi } from "vitest";

import {
  TutoringRequestAttemptConflictError,
  createLearnerTutoringRequest,
  teacherQueueWhere,
  type TutoringRequestServiceDeps,
  type TutoringRequestView,
} from "./tutoringRequestService";
import { InsufficientTutoringCreditsError } from "./tutoringCommercial";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function request(
  overrides: Partial<TutoringRequestView> = {},
): TutoringRequestView {
  return {
    id: "request-1",
    learnerId: "learner-1",
    requestAttemptId: ATTEMPT_ID,
    assignedTeacherId: null,
    tutoringSessionId: null,
    status: "requested",
    requestedMinutes: 60,
    preferredStartsAt: new Date("2026-09-01T15:00:00.000Z"),
    sourceSubjectSlug: "python",
    sourceModuleSlug: "loops",
    sourceExerciseKey: "exercise-1",
    note: "Need help with loop state.",
    assignedAt: null,
    scheduledAt: null,
    completedAt: null,
    canceledAt: null,
    createdAt: new Date("2026-08-28T23:00:00.000Z"),
    updatedAt: new Date("2026-08-28T23:00:00.000Z"),
    ...overrides,
  };
}

function deps(
  overrides: Partial<TutoringRequestServiceDeps> = {},
): TutoringRequestServiceDeps {
  return {
    getBalance: vi.fn(async () => ({
      availableMinutes: 120,
      reservedMinutes: 0,
      totalMinutes: 120,
    })),
    findByAttemptId: vi.fn(async () => null),
    createRequest: vi.fn(async (args) =>
      request({
        learnerId: args.learnerId,
        requestAttemptId: args.requestAttemptId,
        requestedMinutes: args.requestedMinutes,
        preferredStartsAt: new Date(args.preferredStartsAt),
        sourceSubjectSlug: args.sourceSubjectSlug ?? null,
        sourceModuleSlug: args.sourceModuleSlug ?? null,
        sourceExerciseKey: args.sourceExerciseKey ?? null,
        note: args.note ?? null,
      }),
    ),
    reserveRequestCredits: vi.fn(async (
      _requestId,
      _learnerId,
      requestedMinutes,
    ) => ({
      availableMinutes: 120 - requestedMinutes,
      reservedMinutes: requestedMinutes,
      totalMinutes: 120,
    })),
    rollbackUnreservedRequest: vi.fn(async () => undefined),
    ...overrides,
  };
}

const INPUT = {
  learnerId: "learner-1",
  requestAttemptId: ATTEMPT_ID,
  requestedMinutes: 60,
  preferredStartsAt: "2026-09-01T15:00:00.000Z",
  sourceSubjectSlug: "python",
  sourceModuleSlug: "loops",
  sourceExerciseKey: "exercise-1",
  note: "Need help with loop state.",
};

describe("createLearnerTutoringRequest", () => {
  it("creates a request when enough available credit exists", async () => {
    const d = deps();

    const result = await createLearnerTutoringRequest(INPUT, {
      deps: d,
    });

    expect(result.resumed).toBe(false);
    expect(result.request.status).toBe("requested");
    expect(d.createRequest).toHaveBeenCalledTimes(1);
    expect(d.reserveRequestCredits).toHaveBeenCalledWith(
      "request-1",
      "learner-1",
      INPUT.requestedMinutes,
    );
    expect(result.balance).toEqual({
      availableMinutes: 60,
      reservedMinutes: 60,
      totalMinutes: 120,
    });
  });

  it("does not create a request when available credits are below its session length", async () => {
    const d = deps({
      getBalance: vi.fn(async () => ({
        availableMinutes: 30,
        reservedMinutes: 0,
        totalMinutes: 30,
      })),
    });

    await expect(
      createLearnerTutoringRequest(INPUT, { deps: d }),
    ).rejects.toBeInstanceOf(InsufficientTutoringCreditsError);

    expect(d.createRequest).not.toHaveBeenCalled();
  });

  it("resumes the same request attempt instead of creating a duplicate", async () => {
    const existing = request();
    const d = deps({
      findByAttemptId: vi.fn(async () => existing),
    });

    const result = await createLearnerTutoringRequest(INPUT, {
      deps: d,
    });

    expect(result.resumed).toBe(true);
    expect(result.request.id).toBe(existing.id);
    expect(d.createRequest).not.toHaveBeenCalled();
  });

  it("rejects a reused request attempt with different meaning", async () => {
    const d = deps({
      findByAttemptId: vi.fn(async () =>
        request({ requestedMinutes: 30 }),
      ),
    });

    await expect(
      createLearnerTutoringRequest(INPUT, { deps: d }),
    ).rejects.toBeInstanceOf(TutoringRequestAttemptConflictError);
  });

  it("recovers a concurrent unique-key race by reading the winning request", async () => {
    const createError = Object.assign(
      new Error("unique conflict"),
      { code: "P2002" },
    );
    const findByAttemptId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(request());
    const d = deps({
      findByAttemptId,
      createRequest: vi.fn(async () => {
        throw createError;
      }),
    });

    const result = await createLearnerTutoringRequest(INPUT, {
      deps: d,
    });

    expect(result.resumed).toBe(true);
    expect(result.request.id).toBe("request-1");
  });
});

describe("teacherQueueWhere", () => {
  it("gives an enabled tutor assigned work plus the shared unassigned request queue", () => {
    expect(
      teacherQueueWhere({
        teacherId: "teacher-1",
        isAdmin: false,
        poolEnabled: true,
      }),
    ).toEqual({
      status: { in: ["requested", "assigned", "scheduled"] },
      OR: [
        { assignedTeacherId: "teacher-1" },
        { assignedTeacherId: null, status: "requested" },
      ],
    });
  });

  it("does not expose the shared unassigned queue to a disabled tutor", () => {
    expect(
      teacherQueueWhere({
        teacherId: "teacher-1",
        isAdmin: false,
        poolEnabled: false,
      }),
    ).toEqual({
      status: { in: ["requested", "assigned", "scheduled"] },
      assignedTeacherId: "teacher-1",
    });
  });
});
