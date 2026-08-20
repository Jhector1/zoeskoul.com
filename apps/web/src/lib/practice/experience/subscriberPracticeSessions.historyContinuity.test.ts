import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

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

import {
  loadSubscriberModulePracticeHistory,
  loadSubscriberModulePracticeProgress,
} from "./subscriberPracticeSessions.server";

function option(
  exerciseKey: string,
  overrides: Partial<PublishedPracticeExerciseOption> = {},
): PublishedPracticeExerciseOption {
  return {
    id: exerciseKey,
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
    exerciseKey,
    exerciseTitle: exerciseKey,
    exerciseKind: "code_input",
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
    ...overrides,
  };
}

describe("canonical module Practice history across entry origins", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.listPublishedPracticeExerciseOptions.mockResolvedValue([
      option("observe-reassignment"),
      option("double-decimal", {
        topicSlug: "input-and-type-conversion",
      }),
    ]);
    mocks.practiceModuleFindFirst.mockResolvedValue({
      id: "module-db-id",
    });
    mocks.practiceQuestionInstanceFindMany.mockResolvedValue([
      {
        sessionId: "independent-session",
        exerciseKey:
          "python-v2:python-v2-1:unknown:common-variable-mistakes:standalone-standard:observe-reassignment",
        publicPayload: {
          id: "observe-reassignment",
          topicSlug: "common-variable-mistakes",
        },
        answeredAt: new Date("2026-08-20T06:40:00.000Z"),
        createdAt: new Date("2026-08-20T06:35:00.000Z"),
        topic: null,
      },
    ]);
  });

  it("keeps an independent completion even when the DB topic relation is absent", async () => {
    await expect(
      loadSubscriberModulePracticeHistory({
        userId: "learner-1",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
      }),
    ).resolves.toEqual([
      {
        exerciseKey: "observe-reassignment",
        topicSlug: "common-variable-mistakes",
        seenAt: new Date("2026-08-20T06:40:00.000Z"),
        completedAt: new Date("2026-08-20T06:40:00.000Z"),
        sessionId: "independent-session",
      },
    ]);

    const query =
      mocks.practiceQuestionInstanceFindMany.mock.calls[0]?.[0] ?? null;
    expect(query?.where?.session).toEqual({
      userId: "learner-1",
      moduleId: "module-db-id",
    });
    expect(query?.where).not.toHaveProperty("answeredAt");
    expect(query?.where).not.toHaveProperty("topic");
  });

  it("uses that same history for module/sidebar percentage", async () => {
    await expect(
      loadSubscriberModulePracticeProgress({
        userId: "learner-1",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
      }),
    ).resolves.toEqual({
      completed: 1,
      total: 2,
      pct: 0.5,
    });
  });
});
