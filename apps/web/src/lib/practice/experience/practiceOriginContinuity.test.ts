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

import { buildSubscriberModulePracticeContinuationPlan } from "./subscriberPractice";
import { loadSubscriberModulePracticeProgress } from "./subscriberPracticeSessions.server";

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
    moduleSlug: "python-v2-module-0",
    moduleTitle: "Getting Started",
    sectionSlug: "python-v2-section-0",
    sectionTitle: "First Programs",
    sectionRole: "lesson",
    topicSlug: "python-output",
    topicTitle: "Display Output",
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

describe("Practice completion continuity across entry origins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts an independently completed Practice exercise first when module Practice opens", () => {
    const options = [
      option("done-independent", {
        sectionSlug: "section-a",
        topicSlug: "topic-a",
      }),
      option("remaining", {
        sectionSlug: "section-b",
        topicSlug: "topic-b",
      }),
    ];

    const plan = buildSubscriberModulePracticeContinuationPlan({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      history: [
        {
          exerciseKey: "done-independent",
          topicSlug: "topic-a",
          seenAt: "2026-08-19T20:00:00.000Z",
          completedAt: "2026-08-19T20:00:00.000Z",
          sessionId: "independent-header-practice-session",
        },
      ],
      seed: "origin-continuity",
    });

    expect(plan.moduleTotal).toBe(2);
    expect(plan.completedPrefix.map((target) => target.exerciseKey)).toEqual([
      "done-independent",
    ]);
    expect(plan.queue.map((target) => target.exerciseKey)).toEqual([
      "remaining",
    ]);

    expect(
      [...plan.completedPrefix, ...plan.queue].map(
        (target) => target.exerciseKey,
      ),
    ).toEqual(["done-independent", "remaining"]);
  });

  it("counts independent Practice completion in the lesson/module percentage", async () => {
    mocks.listPublishedPracticeExerciseOptions.mockResolvedValue([
      option("done-independent", {
        sectionSlug: "section-a",
        topicSlug: "topic-a",
      }),
      option("remaining", {
        sectionSlug: "section-b",
        topicSlug: "topic-b",
      }),
    ]);
    mocks.practiceModuleFindFirst.mockResolvedValue({
      id: "module-db-id",
    });
    mocks.practiceQuestionInstanceFindMany.mockResolvedValue([
      {
        sessionId: "independent-header-practice-session",
        experienceItemKey: null,
        exerciseKey:
          "python-v2:python-v2-module-0:section-a:topic-a:standalone-standard:done-independent",
        publicPayload: {
          id: "done-independent",
        },
        answeredAt: new Date("2026-08-19T20:00:00.000Z"),
        createdAt: new Date("2026-08-19T19:55:00.000Z"),
        topic: {
          slug: "topic-a",
        },
        attempts: [{ ok: true }],
      },
    ]);

    await expect(
      loadSubscriberModulePracticeProgress({
        userId: "learner-1",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-module-0",
      }),
    ).resolves.toEqual({
      completed: 1,
      total: 2,
      pct: 0.5,
    });

    expect(mocks.practiceQuestionInstanceFindMany).toHaveBeenCalledTimes(1);
    const query =
      mocks.practiceQuestionInstanceFindMany.mock.calls[0]?.[0] ?? null;

    expect(query?.where?.OR?.[0]?.experienceItemKey?.startsWith).toContain(
      "self-paced:user:learner-1:module:python-v2-module-0:",
    );
    expect(query?.where?.OR?.[1]?.session).toEqual({
      userId: "learner-1",
      moduleId: "module-db-id",
    });

    expect(query?.where?.OR?.[1]?.session).not.toHaveProperty("id");
    expect(query?.where?.OR?.[1]?.session).not.toHaveProperty("mode");
    expect(query?.where?.OR?.[1]?.session).not.toHaveProperty("meta");
  });
});
