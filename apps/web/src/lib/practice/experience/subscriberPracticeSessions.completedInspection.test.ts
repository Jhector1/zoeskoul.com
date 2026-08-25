import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublishedPracticeExerciseOptions: vi.fn(),
  practiceModuleFindFirst: vi.fn(),
  practiceQuestionInstanceFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    practiceModule: {
      findFirst: mocks.practiceModuleFindFirst,
    },
    practiceQuestionInstance: {
      findMany: mocks.practiceQuestionInstanceFindMany,
    },
  },
}));

vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listPublishedPracticeExerciseOptions:
    mocks.listPublishedPracticeExerciseOptions,
}));

import { loadSubscriberModulePracticeHistory } from "./subscriberPracticeSessions.server";

function option() {
  return {
    id: "observe-reassignment",
    catalogSlug: "python",
    catalogTitle: "Python",
    subjectSlug: "python-v2",
    subjectTitle: "Python for Beginners",
    releaseStatus: "active",
    moduleSlug: "python-v2-1",
    moduleTitle: "Variables, Input, and Strings",
    sectionSlug: "section-a",
    sectionTitle: "Variables",
    sectionRole: "lesson",
    topicSlug: "common-variable-mistakes",
    topicTitle: "Common Variable Mistakes",
    exerciseKey: "observe-reassignment",
    exerciseTitle: "Observe reassignment",
    exerciseKind: "code_input",
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
  } as any;
}

describe("completed Practice inspection history boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPublishedPracticeExerciseOptions.mockResolvedValue([option()]);
    mocks.practiceModuleFindFirst.mockResolvedValue({ id: "module-db-id" });
    mocks.practiceQuestionInstanceFindMany.mockResolvedValue([
      {
        id: "instance-1",
        sessionId: null,
        experienceItemKey:
          "self-paced:user:learner-1:module:python-v2-1:topic:common-variable-mistakes:exercise:observe-reassignment",
        exerciseKey: "observe-reassignment",
        kind: "code_input",
        difficulty: "beginner",
        title: "Observe reassignment",
        prompt: "Print the reassigned value.",
        publicPayload: {
          id: "observe-reassignment",
          exerciseKey: "observe-reassignment",
          topicSlug: "common-variable-mistakes",
          kind: "code_input",
          title: "Observe reassignment",
          prompt: "Print the reassigned value.",
          code: "value = 1\\n",
        },
        answeredAt: new Date("2026-08-20T06:40:00.000Z"),
        createdAt: new Date("2026-08-20T06:35:00.000Z"),
        topic: null,
        attempts: [
          {
            ok: true,
            answerPayload: {
              kind: "code_input",
              code: "value = 2\\nprint(value)\\n",
            },
            createdAt: new Date("2026-08-20T06:39:59.000Z"),
          },
        ],
      },
    ]);
  });

  it("preserves the existing lightweight history shape unless inspection is requested", async () => {
    const history = await loadSubscriberModulePracticeHistory({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
    });

    expect(history).toEqual([
      {
        exerciseKey: "observe-reassignment",
        topicSlug: "common-variable-mistakes",
        seenAt: new Date("2026-08-20T06:40:00.000Z"),
        completedAt: new Date("2026-08-20T06:40:00.000Z"),
        lastOk: true,
        sessionId: null,
      },
    ]);
  });

  it("returns only public exercise data plus this learner's answer for completed inspection", async () => {
    const history = await loadSubscriberModulePracticeHistory({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      includeReview: true,
    });

    expect(history[0]?.review).toMatchObject({
      instanceId: "instance-1",
      answeredAt: "2026-08-20T06:40:00.000Z",
      topic: "common-variable-mistakes",
      kind: "code_input",
      lastOk: true,
      lastAnswerPayload: {
        kind: "code_input",
        code: "value = 2\\nprint(value)\\n",
      },
    });

    const query =
      mocks.practiceQuestionInstanceFindMany.mock.calls.at(-1)?.[0] ?? null;
    expect(query?.select?.secretPayload).toBeUndefined();
    expect(query?.select?.attempts?.where).toMatchObject({
      userId: "learner-1",
      revealUsed: false,
    });
    expect(query?.select?.attempts?.select).toEqual({
      ok: true,
      answerPayload: true,
      createdAt: true,
    });
  });
});
