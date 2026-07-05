import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  applyDailyFiveParams,
  isDailyFiveEligible,
  pickDailyFiveQueue,
  resolveNextDailyFiveTarget,
} from "./dailyFive";

const TEST_TARGET_COUNT = 3;

function option(
  exerciseKey: string,
  overrides: Partial<PublishedPracticeExerciseOption> = {},
): PublishedPracticeExerciseOption {
  return {
    id: exerciseKey,
    catalogSlug: "python",
    catalogTitle: "Python",
    subjectSlug: "python-v2",
    subjectTitle: "Python V2",
    releaseStatus: "active",
    moduleSlug: "python-v2-0",
    moduleTitle: "Foundations",
    sectionSlug: "python-v2-basics",
    sectionTitle: "Basics",
    sectionRole: "lesson",
    topicSlug: `topic-${exerciseKey}`,
    topicTitle: exerciseKey,
    exerciseKey,
    exerciseTitle: exerciseKey,
    exerciseKind: "code_input",
    exercisePurpose: "quiz",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: true,
    ...overrides,
  };
}

describe("daily practice selection", () => {
  it("accepts standalone single-file code try-its regardless of authored purpose", () => {
    expect(isDailyFiveEligible(option("quiz"))).toBe(true);
    expect(
      isDailyFiveEligible(
        option("project", { exercisePurpose: "project" }),
      ),
    ).toBe(true);
    expect(
      isDailyFiveEligible(option("not-try-it", { isStandaloneTryIt: false })),
    ).toBe(false);
    expect(
      isDailyFiveEligible(
        option("module-project", { sectionRole: "module_project" }),
      ),
    ).toBe(false);
    expect(
      isDailyFiveEligible(option("capstone", { sectionRole: "capstone" })),
    ).toBe(false);
    expect(isDailyFiveEligible(option("multi", { isMultiFile: true }))).toBe(false);
    expect(isDailyFiveEligible(option("pty", { requiresTerminal: true }))).toBe(false);
    expect(
      isDailyFiveEligible(
        option("choice", { exerciseKind: "single_choice" }),
      ),
    ).toBe(false);
  });

  it("builds the configured number of deterministic unique targets", () => {
    const options = Array.from({ length: 8 }, (_, index) => option(`ci-${index}`));
    const first = pickDailyFiveQueue({
      options,
      userId: "user-1",
      dayKey: "2026-07-05",
      targetCount: TEST_TARGET_COUNT,
    });
    const again = pickDailyFiveQueue({
      options,
      userId: "user-1",
      dayKey: "2026-07-05",
      targetCount: TEST_TARGET_COUNT,
    });

    expect(first).toEqual(again);
    expect(first).toHaveLength(TEST_TARGET_COUNT);
    expect(new Set(first.map((row) => row.exerciseKey)).size).toBe(
      TEST_TARGET_COUNT,
    );
  });


  it("builds one queue across several sections in the same module", () => {
    const options = [
      option("ci-a", { sectionSlug: "section-a", topicSlug: "topic-a" }),
      option("ci-b", { sectionSlug: "section-b", topicSlug: "topic-b" }),
      option("ci-c", { sectionSlug: "section-c", topicSlug: "topic-c" }),
    ];

    const queue = pickDailyFiveQueue({
      options,
      userId: "user-1",
      dayKey: "2026-07-05",
      targetCount: 3,
    });

    expect(queue).toHaveLength(3);
    expect(new Set(queue.map((row) => row.sectionSlug))).toEqual(
      new Set(["section-a", "section-b", "section-c"]),
    );
  });

  it("does not combine exercises from different modules", () => {
    const options = [
      option("m1-a", { moduleSlug: "module-1", sectionSlug: "one-a" }),
      option("m1-b", { moduleSlug: "module-1", sectionSlug: "one-b" }),
      option("m2-a", { moduleSlug: "module-2", sectionSlug: "two-a" }),
      option("m2-b", { moduleSlug: "module-2", sectionSlug: "two-b" }),
    ];

    expect(
      pickDailyFiveQueue({
        options,
        userId: "user-1",
        dayKey: "2026-07-05",
        targetCount: 3,
      }),
    ).toEqual([]);
  });

  it("deduplicates repeated authored exercise references", () => {
    const options = [
      option("ci-a", { id: "ref-a-1", sectionSlug: "section-a" }),
      option("ci-a", { id: "ref-a-2", sectionSlug: "section-b" }),
      option("ci-b", { id: "ref-b" }),
      option("ci-c", { id: "ref-c" }),
    ];

    const queue = pickDailyFiveQueue({
      options,
      userId: "user-1",
      dayKey: "2026-07-05",
      targetCount: 3,
    });

    expect(queue).toHaveLength(3);
    expect(new Set(queue.map((row) => row.exerciseKey)).size).toBe(3);
  });


  it("locks each queued target to its authored purpose", () => {
    const projectTarget = option("project-try-it", {
      exercisePurpose: "project",
    });
    const params = applyDailyFiveParams(
      { sessionId: "session-1" } as any,
      {
        meta: {
          kind: "daily_five",
          dayKey: "2026-07-05",
          locale: "en",
          queue: [projectTarget],
          targetCount: 1,
          maxAttempts: 3,
        },
        instances: [],
      },
    );

    expect(params.exerciseKey).toBe("project-try-it");
    expect(params.preferPurpose).toBe("project");
    expect(params.purposePolicy).toBe("strict");
  });

  it("advances by canonical exercise key", () => {
    const queue = Array.from({ length: TEST_TARGET_COUNT }, (_, index) =>
      option(`ci-${index}`),
    );
    expect(
      resolveNextDailyFiveTarget({
        meta: {
          kind: "daily_five",
          dayKey: "2026-07-05",
          locale: "en",
          queue,
          targetCount: queue.length,
          maxAttempts: 3,
        },
        usedExerciseKeys: ["ci-0", "ci-1"],
      })?.exerciseKey,
    ).toBe("ci-2");
  });

  it("keeps an older stored run valid after the environment default changes", () => {
    const legacyQueue = Array.from({ length: 5 }, (_, index) =>
      option(`legacy-${index}`),
    );
    expect(
      resolveNextDailyFiveTarget({
        meta: {
          kind: "daily_five",
          dayKey: "2026-07-04",
          locale: "en",
          queue: legacyQueue,
          maxAttempts: 3,
        },
        usedExerciseKeys: ["legacy-0"],
      })?.exerciseKey,
    ).toBe("legacy-1");
  });
});
