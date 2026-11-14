import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    gradeInstance: vi.fn(),
    persistValidatedAttempt: vi.fn(),
}));

vi.mock("@/lib/practice/adminLab/approvedPublishedCourse2Capstone", () => ({
    isCurrentApprovedCourse2FinalInstance: vi.fn(() => false),
}));

vi.mock("@/lib/practice/actor", () => ({
    attachGuestCookie: (response: Response) => response,
}));

vi.mock("@/lib/gamification/awardValidateGamification", () => ({
    awardValidateGamification: vi.fn(),
}));

vi.mock("./mappers/expected.mapper", () => ({
    getExpectedCanon: vi.fn(() => ({
        kind: "code_input",
    })),
}));

vi.mock("./services/currentAuthoredSqlExpected.service", () => ({
    selectExpectedCanonForValidation: vi.fn(
        ({ persistedExpected }) => persistedExpected,
    ),
}));

vi.mock("./services/grading.service", () => ({
    gradeInstance: mocks.gradeInstance,
}));

vi.mock("./guards/instance.guard", () => ({
    assertAnswerKindMatchesInstance: vi.fn(),
}));

vi.mock("./policies/validate.policy", () => ({
    computeCanReveal: vi.fn(() => false),
}));

vi.mock("./repositories/attempt.repo", () => ({
    countPriorFailedAttempts: vi.fn(),
    loadFinalizedValidateSnapshot: vi.fn(),
    persistValidatedAttempt: mocks.persistValidatedAttempt,
}));

vi.mock("../shared/attempts", () => ({
    computeMaxAttempts: vi.fn(() => 3),
    computeAttemptsLeft: vi.fn(() => 3),
}));

vi.mock("../shared/http", () => ({
    jsonApiResponse: ({
        requestId,
        message,
        status,
        extra,
    }: {
        requestId: string;
        message: string;
        status: number;
        extra?: Record<string, unknown>;
    }) => {
        const response = Response.json(
            {
                requestId,
                message,
                ...(extra ?? {}),
            },
            { status },
        );
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

vi.mock("../shared/run", () => ({
    resolvePracticeRunMode: vi.fn(() => "practice"),
}));

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

vi.mock("@/lib/practice/help/steps", () => ({
    PRACTICE_REVEAL_FAILURE_THRESHOLD: 3,
}));

import { handlePracticeValidate } from "./handler";
import {
    createRunnerUnavailableGradeResult,
} from "./grade/infrastructureFailure";

beforeEach(() => {
    mocks.gradeInstance.mockReset();
    mocks.persistValidatedAttempt.mockReset();
});

describe("handlePracticeValidate runner outages", () => {
    it("returns 503 before persisting or consuming an attempt", async () => {
        mocks.gradeInstance.mockResolvedValue(
            createRunnerUnavailableGradeResult("fetch failed"),
        );

        const response = await handlePracticeValidate({
            prisma: {} as never,
            req: new Request(
                "https://zoeskoul.test/api/practice/validate",
                { method: "POST" },
            ),
            requestId: "request-1",
            body: {
                key: "signed-key",
                submissionId: "submission-1",
                answer: {
                    kind: "code_input",
                    language: "python",
                    code:
                        "def add_tax(price):\n    return price + 2\n",
                },
            } as never,
            key: "signed-key",
            payload: {},
            actor: {
                userId: "user-1",
                guestId: null,
            } as never,
            setGuestId: null,
            instance: {
                id: "instance-1",
                kind: "code_input",
                answeredAt: null,
                publicPayload: {},
                secretPayload: {},
                session: null,
            } as never,
            session: null,
            locale: "en",
        });

        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("5");
        await expect(response.json()).resolves.toMatchObject({
            ok: null,
            code: "RUNNER_UNAVAILABLE",
            message:
                "The code runner is temporarily unavailable. Try again in a moment.",
            finalized: false,
            duplicate: false,
            attempts: null,
            sessionComplete: false,
        });
        expect(mocks.persistValidatedAttempt).not.toHaveBeenCalled();
    });
});


describe("Course 2 authoritative final-step grading guard", () => {
    it("blocks legacy command-only completion before attempts, grading, or replay", async () => {
        const response = await handlePracticeValidate({
            prisma: {} as never,
            req: new Request("https://zoeskoul.test/api/practice/validate", { method: "POST" }),
            requestId: "capstone-no-private-contract",
            body: {
                key: "signed-key",
                submissionId: "capstone-submit",
                answer: { kind: "code_input", language: "bash", code: "chmod 600 /workspace/secure-project/secrets.env" },
            } as never,
            key: "signed-key",
            payload: {},
            actor: { userId: "student-1", guestId: null } as never,
            setGuestId: null,
            instance: {
                id: "old-capstone-final",
                exerciseKey: "final-capstone-secure-project-step-5",
                kind: "code_input",
                // A previously finalized command-only instance must not be
                // treated as trusted filesystem evidence.
                answeredAt: new Date("2026-11-01T00:00:00Z"),
                publicPayload: {},
                secretPayload: { expected: { terminalExpectations: { requiredCommands: [] } } },
                topic: {
                    slug: "linux-files-permissions-users.final-capstone-secure-project",
                    subject: { slug: "linux-files-permissions-users" },
                    module: { slug: "linux-module-4-secure-project-capstone" },
                },
                session: null,
            } as never,
            session: null,
            locale: "en",
        });
        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("5");
        await expect(response.json()).resolves.toMatchObject({
            ok: null,
            code: "RUNNER_UNAVAILABLE",
            finalized: false,
            attempts: null,
        });
        expect(mocks.gradeInstance).not.toHaveBeenCalled();
        expect(mocks.persistValidatedAttempt).not.toHaveBeenCalled();
    });
});
