import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  published: vi.fn(),
  moduleFindMany: vi.fn(),
  instanceFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    practiceModule: {
      findFirst: vi.fn(),
      findMany: mocks.moduleFindMany,
    },
    practiceQuestionInstance: {
      findMany: mocks.instanceFindMany,
    },
  },
}));
vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listPublishedPracticeExerciseOptions: mocks.published,
}));

import { loadSubscriberPracticeContinuations } from "./subscriberPracticeSessions.server";

function option(exerciseKey: string, topicSlug: string) {
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
    topicSlug,
    topicTitle: topicSlug,
    exerciseKey,
    exerciseTitle: exerciseKey,
    exerciseKind: "code_input",
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
  } as any;
}

const catalogs = [{
  slug: "python",
  title: "Python",
  titleKey: null,
  exerciseCount: 2,
  dailyExerciseCount: 2,
  courses: [{
    slug: "python-v2",
    title: "Python for Beginners",
    titleKey: null,
    catalogSlug: "python",
    catalogTitle: "Python",
    exerciseCount: 2,
    dailyExerciseCount: 2,
    modules: [{
      slug: "python-v2-1",
      title: "Variables, Input, and Strings",
      titleKey: null,
      availability: "available",
      billingHref: null,
      exerciseCount: 2,
      dailyExerciseCount: 2,
      sections: [],
    }],
  }],
}] as any;

describe("canonical module Practice Continue projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.published.mockResolvedValue([
      option("practice-a", "topic-a"),
      option("practice-b", "topic-b"),
    ]);
    mocks.moduleFindMany.mockResolvedValue([
      {
        id: "module-db-id",
        slug: "python-v2-1",
        subject: { slug: "python-v2" },
      },
      {
        id: "orphan-module-db-id",
        slug: "orphan-module",
        subject: null,
      },
    ]);
  });

  it("surfaces a sessionless canonical module that was started but not finished", async () => {
    mocks.instanceFindMany.mockResolvedValue([{
      exerciseKey: "practice-a",
      experienceItemKey:
        "self-paced:user:learner-1:module:python-v2-1:topic:topic-a:exercise:practice-a",
      publicPayload: { id: "practice-a", topicSlug: "topic-a" },
      answeredAt: null,
      createdAt: new Date("2026-08-22T08:00:00.000Z"),
      topic: null,
      session: null,
    }]);

    const result = await loadSubscriberPracticeContinuations({
      userId: "learner-1",
      catalogs,
    });

    expect(result).toEqual([
      expect.objectContaining({
        continuationKey: "python-v2|python-v2-1",
        selection: expect.objectContaining({
          subjectSlug: "python-v2",
          moduleSlug: "python-v2-1",
        }),
        completedCount: 0,
        totalCount: 2,
      }),
    ]);
    expect(mocks.moduleFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.instanceFindMany).toHaveBeenCalledTimes(1);

    const query = mocks.instanceFindMany.mock.calls[0]?.[0];
    const legacyModuleIds =
      query?.where?.OR?.find(
        (entry: any) => entry?.session?.moduleId?.in,
      )?.session?.moduleId?.in ?? [];

    expect(legacyModuleIds).toEqual(["module-db-id"]);
    expect(legacyModuleIds).not.toContain("orphan-module-db-id");
  });

  it("includes legacy/Daily module history without reviving PracticeSession resume", async () => {
    mocks.instanceFindMany.mockResolvedValue([{
      exerciseKey: "practice-a",
      experienceItemKey: null,
      publicPayload: { id: "practice-a", topicSlug: "topic-a" },
      answeredAt: new Date("2026-08-22T08:01:00.000Z"),
      createdAt: new Date("2026-08-22T08:00:00.000Z"),
      topic: null,
      session: { moduleId: "module-db-id" },
    }]);

    const result = await loadSubscriberPracticeContinuations({
      userId: "learner-1",
      catalogs,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      completedCount: 1,
      totalCount: 2,
    });
  });

  it("does not show Continue after every authored Practice exercise is complete", async () => {
    mocks.instanceFindMany.mockResolvedValue([
      {
        exerciseKey: "practice-a",
        experienceItemKey:
          "self-paced:user:learner-1:module:python-v2-1:topic:topic-a:exercise:practice-a",
        publicPayload: { id: "practice-a", topicSlug: "topic-a" },
        answeredAt: new Date("2026-08-22T08:01:00.000Z"),
        createdAt: new Date("2026-08-22T08:00:00.000Z"),
        topic: null,
        session: null,
      },
      {
        exerciseKey: "practice-b",
        experienceItemKey:
          "self-paced:user:learner-1:module:python-v2-1:topic:topic-b:exercise:practice-b",
        publicPayload: { id: "practice-b", topicSlug: "topic-b" },
        answeredAt: new Date("2026-08-22T08:03:00.000Z"),
        createdAt: new Date("2026-08-22T08:02:00.000Z"),
        topic: null,
        session: null,
      },
    ]);

    await expect(
      loadSubscriberPracticeContinuations({
        userId: "learner-1",
        catalogs,
      }),
    ).resolves.toEqual([]);
  });
});
