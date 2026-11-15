import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the ONE student grading entry point. Both ordinary code
 * grading and trusted filesystem verification MUST converge on the same
 * attempt transaction. These are isolated mocked integration tests: they do
 * not start a privileged lab, grant curriculum approval, or write a database.
 */
const mocks = vi.hoisted(() => ({
  grade: vi.fn(),
  verifyFilesystem: vi.fn(),
  persist: vi.fn(),
  expected: vi.fn(),
  isApproved: vi.fn(),
  award: vi.fn(),
  loadSnapshot: vi.fn(),
}));

vi.mock("@/lib/practice/actor", () => ({
  attachGuestCookie: (response: Response) => response,
}));
vi.mock("@/lib/gamification/awardValidateGamification", () => ({
  awardValidateGamification: mocks.award,
}));
vi.mock("@/lib/practice/adminLab/approvedPublishedCourse2Capstone", () => ({
  isCurrentApprovedCourse2FinalInstance: mocks.isApproved,
}));
vi.mock("./mappers/expected.mapper", () => ({ getExpectedCanon: mocks.expected }));
vi.mock("./services/currentAuthoredSqlExpected.service", () => ({
  selectExpectedCanonForValidation: ({ persistedExpected }: { persistedExpected: unknown }) => persistedExpected,
}));
vi.mock("./services/grading.service", () => ({ gradeInstance: mocks.grade }));
vi.mock("./grade/verifyAdminLabFilesystem", () => ({
  verifyAdminLabFilesystemForPractice: mocks.verifyFilesystem,
}));
vi.mock("./guards/instance.guard", () => ({ assertAnswerKindMatchesInstance: vi.fn() }));
vi.mock("./policies/validate.policy", () => ({ computeCanReveal: vi.fn(() => false) }));
vi.mock("./repositories/attempt.repo", () => ({
  countPriorFailedAttempts: vi.fn(),
  loadFinalizedValidateSnapshot: mocks.loadSnapshot,
  persistValidatedAttempt: mocks.persist,
}));
vi.mock("../shared/attempts", () => ({
  computeMaxAttempts: vi.fn(() => 3),
  computeAttemptsLeft: vi.fn(() => 2),
}));
vi.mock("../shared/http", () => ({
  jsonApiResponse: ({ requestId, message, status, extra }: {
    requestId: string; message: string; status: number; extra?: Record<string, unknown>;
  }) => {
    const response = Response.json({ requestId, message, ...(extra ?? {}) }, { status });
    response.headers.set("X-Request-Id", requestId);
    return response;
  },
  safeSameOriginUrl: vi.fn(() => null),
  hardenApiResponse: (response: Response) => response,
}));
vi.mock("../shared/sessionAccess", () => ({
  assertSessionOwnerMatchesActor: vi.fn(),
  assertAssignmentSessionAccess: vi.fn(),
}));
vi.mock("../shared/run", () => ({ resolvePracticeRunMode: vi.fn(() => "practice") }));
vi.mock("@/lib/practice/challenges/session", () => ({
  getSessionMaxAttempts: vi.fn(() => null),
  readSharedChallengeMeta: vi.fn(() => null),
}));
vi.mock("@/lib/practice/experience/resolve", () => ({
  assertPracticeExperienceInvariant: vi.fn(),
  resolvePracticeExperienceMode: vi.fn(() => "practice"),
}));
vi.mock("@/lib/practice/experience/dailyFive", () => ({
  readDailyFiveMeta: vi.fn(() => null),
}));
vi.mock("@/lib/practice/help/steps", () => ({ PRACTICE_REVEAL_FAILURE_THRESHOLD: 3 }));

import { handlePracticeValidate } from "./handler";
import { createRunnerUnavailableGradeResult } from "./grade/infrastructureFailure";

const ordinaryExpected = { kind: "code_input", tests: [] };
const filesystemExpected = {
  kind: "code_input",
  adminLabFilesystemExpectations: {
    required: [{ path: "/workspace/project", kind: "directory", mode: "0750" }],
  },
};
const ordinaryInstance = {
  id: "instance-1", exerciseKey: "ordinary-shell", kind: "code_input",
  answeredAt: null, publicPayload: {}, secretPayload: { expected: ordinaryExpected },
  session: null,
};
const finalInstance = {
  ...ordinaryInstance,
  id: "final-instance",
  exerciseKey: "final-capstone-secure-project-step-5",
  topic: {
    slug: "final-capstone-secure-project",
    subject: { slug: "linux-files-permissions-users" },
    module: { slug: "linux-module-4-secure-project-capstone" },
  },
};

function validate(instance: Record<string, unknown> = ordinaryInstance) {
  return handlePracticeValidate({
    prisma: {} as never,
    req: new Request("https://zoeskoul.test/api/practice/validate", { method: "POST" }),
    requestId: "single-pipeline-test",
    body: {
      key: "signed-key", submissionId: "submission-test",
      answer: { kind: "code_input", language: "bash", code: "echo hello" },
    } as never,
    key: "signed-key", payload: {},
    actor: { userId: "student-1", guestId: null } as never,
    setGuestId: null,
    instance: instance as never,
    session: null,
    locale: "en",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.expected.mockReturnValue(ordinaryExpected);
  mocks.isApproved.mockReturnValue(false);
  mocks.grade.mockResolvedValue({ ok: true, explanation: "Normal answer accepted", feedback: null });
  mocks.verifyFilesystem.mockResolvedValue({ ok: true, explanation: "Trusted evidence verified", feedback: null });
  mocks.persist.mockResolvedValue({
    kind: "persisted", created: true, duplicate: false, ok: true,
    revealUsed: false, finalized: true, attemptsUsed: 1,
    sessionComplete: false, sessionSummary: null,
    priorNonRevealAttempts: 0,
  });
  mocks.award.mockResolvedValue(null);
});

describe("one ZoeLearning student grading and persistence path", () => {
  it("grades ordinary Course 1-style answers and persists once", async () => {
    const response = await validate();
    expect(response.status).toBe(200);
    expect(mocks.grade).toHaveBeenCalledTimes(1);
    expect(mocks.verifyFilesystem).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ok: true, submissionId: "submission-test", instance: ordinaryInstance,
    }));
    expect(await response.json()).toMatchObject({
      ok: true, expected: null, revealAnswer: null, attempts: { used: 1 },
    });
  });

  it("routes trusted filesystem evidence through the SAME attempt writer", async () => {
    mocks.expected.mockReturnValue(filesystemExpected);
    const response = await validate();
    expect(response.status).toBe(200);
    expect(mocks.grade).not.toHaveBeenCalled();
    expect(mocks.verifyFilesystem).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ok: true, submissionId: "submission-test", instance: ordinaryInstance,
    }));
    const publicBody = await response.json();
    expect(publicBody).toMatchObject({ ok: true, expected: null, revealAnswer: null });
    expect(JSON.stringify(publicBody)).not.toContain("adminLabFilesystemExpectations");
    expect(JSON.stringify(publicBody)).not.toContain("/workspace/project");
  });

  it("persists a genuinely failed filesystem result as a normal failed attempt", async () => {
    mocks.expected.mockReturnValue(filesystemExpected);
    mocks.verifyFilesystem.mockResolvedValue({ ok: false, explanation: "Incorrect filesystem state", feedback: null });
    mocks.persist.mockResolvedValue({
      kind: "persisted", created: true, duplicate: false, ok: false,
      revealUsed: false, finalized: false, attemptsUsed: 1,
      sessionComplete: false, sessionSummary: null, priorNonRevealAttempts: 0,
    });
    const response = await validate();
    expect(response.status).toBe(200);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ok: false }));
    expect(await response.json()).toMatchObject({ ok: false, finalized: false, expected: null });
  });

  it("never writes an attempt when Runner verification is unavailable", async () => {
    mocks.expected.mockReturnValue(filesystemExpected);
    mocks.verifyFilesystem.mockResolvedValue(createRunnerUnavailableGradeResult("offline"));
    const response = await validate();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.award).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: null, code: "RUNNER_UNAVAILABLE", attempts: null, finalized: false,
    });
  });

  it("rejects an unapproved FINAL capstone even when it appears previously finalized", async () => {
    mocks.expected.mockReturnValue(filesystemExpected);
    const response = await validate({
      ...finalInstance, answeredAt: new Date("2026-11-01T00:00:00Z"),
      secretPayload: { expected: filesystemExpected },
    });
    expect(response.status).toBe(503);
    expect(mocks.isApproved).toHaveBeenCalledTimes(1);
    expect(mocks.grade).not.toHaveBeenCalled();
    expect(mocks.verifyFilesystem).not.toHaveBeenCalled();
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("uses the SAME persister for an explicitly approved FINAL contract", async () => {
    // Approval is MOCKED here; the real bundle fingerprint approval is covered
    // by approvedPublishedCourse2Capstone.test.ts, not granted by this test.
    mocks.isApproved.mockReturnValue(true);
    mocks.expected.mockReturnValue(filesystemExpected);
    const response = await validate({
      ...finalInstance, secretPayload: { expected: filesystemExpected },
    });
    expect(response.status).toBe(200);
    expect(mocks.verifyFilesystem).toHaveBeenCalledTimes(1);
    expect(mocks.grade).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ ok: true, expected: null });
  });
});
