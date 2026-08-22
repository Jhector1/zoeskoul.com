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
  loadCanonicalModulePracticeDisplay,
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
        sessionId: null,
        experienceItemKey:
          "self-paced:user:learner-1:module:python-v2-1:topic:common-variable-mistakes:exercise:observe-reassignment",
        exerciseKey: "observe-reassignment",
        publicPayload: {
          id: "observe-reassignment",
          topicSlug: "common-variable-mistakes",
        },
        answeredAt: new Date("2026-08-20T06:40:00.000Z"),
        createdAt: new Date("2026-08-20T06:35:00.000Z"),
        topic: null,
        attempts: [{ ok: true }],
      },
    ]);
  });

  it("reads one sessionless completion for Header and Lesson/Review", async () => {
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
        lastOk: true,
        sessionId: null,
      },
    ]);

    const query =
      mocks.practiceQuestionInstanceFindMany.mock.calls[0]?.[0] ?? null;
    expect(query?.where?.OR?.[0]?.experienceItemKey?.startsWith).toContain(
      "self-paced:user:learner-1:module:python-v2-1:",
    );
    expect(query?.where?.OR?.[1]?.session).toEqual({
      userId: "learner-1",
      moduleId: "module-db-id",
    });
  });

  it("uses that same canonical history for module/sidebar percentage", async () => {
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
  it("projects the full canonical module in authored order with completion overlaid", async () => {
    const display = await loadCanonicalModulePracticeDisplay({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
    });

    expect(display.moduleTotal).toBe(2);
    expect(display.selectedTargets.map((item) => item.exerciseKey)).toEqual([
      "observe-reassignment",
      "double-decimal",
    ]);
    expect(display.completedPrefix).toMatchObject([
      {
        exerciseKey: "observe-reassignment",
        topicSlug: "common-variable-mistakes",
        correct: true,
      },
    ]);
  });

});
