import { describe, expect, it } from "vitest";

import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  applySubscriberPracticeParams,
  buildSubscriberPracticeMeta,
  isSubscriberPracticeEligible,
  pickSubscriberPracticeQueue,
  readSubscriberPracticeMeta,
  subscriberPracticeScopeFromMeta,
  touchSubscriberPracticeMeta,
} from "./subscriberPractice";

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
    exercisePurpose: "try_it",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: true,
    ...overrides,
  };
}

describe("subscriber authored practice queue", () => {
  it("includes lesson quizzes, try-its, and authenticated terminal exercises", () => {
    expect(isSubscriberPracticeEligible(option("try-it"))).toBe(true);
    expect(
      isSubscriberPracticeEligible(
        option("quiz", {
          exercisePurpose: "quiz",
          exerciseKind: "single_choice",
        }),
      ),
    ).toBe(true);
    expect(
      isSubscriberPracticeEligible(
        option("terminal", { requiresTerminal: true }),
      ),
    ).toBe(true);
    expect(
      isSubscriberPracticeEligible(
        option("capstone", { sectionRole: "capstone" }),
      ),
    ).toBe(false);
  });

  it("uses the remaining topic exercises when fewer than ten exist", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [
        option("code-1"),
        option("sc-1", {
          exercisePurpose: "quiz",
          exerciseKind: "single_choice",
        }),
      ],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "python-v2-section-0",
      topicSlug: "python-output",
      targetCount: 10,
    });

    expect(queue).toHaveLength(2);
    expect(queue.map((target) => target.exercisePurpose)).toEqual([
      "project",
      "quiz",
    ]);
  });

  it("preserves the exact topic scope and last-opened time", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [option("code-1")],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "python-v2-section-0",
      topicSlug: "python-output",
      targetCount: 10,
    });
    const meta = buildSubscriberPracticeMeta({
      queue,
      lastOpenedAt: "2026-07-22T18:00:00.000Z",
    });

    expect(subscriberPracticeScopeFromMeta(meta)).toEqual({
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "python-v2-section-0",
      topicSlug: "python-output",
    });
    expect(readSubscriberPracticeMeta(meta)?.lastOpenedAt).toBe(
      "2026-07-22T18:00:00.000Z",
    );
    expect(
      readSubscriberPracticeMeta(
        touchSubscriberPracticeMeta(
          meta,
          new Date("2026-07-22T19:00:00.000Z"),
        ),
      )?.lastOpenedAt,
    ).toBe("2026-07-22T19:00:00.000Z");
  });

  it("locks every request to the next exact authored target", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [option("code-1"), option("code-2")],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "python-v2-section-0",
      topicSlug: "python-output",
      targetCount: 10,
    });
    const meta = buildSubscriberPracticeMeta({ queue });

    expect(readSubscriberPracticeMeta(meta)?.targetCount).toBe(2);
    expect(
      applySubscriberPracticeParams(
        { sessionId: "session-1" },
        {
          id: "session-1",
          meta,
          instances: [
            {
              exerciseKey: "code-1",
              topic: { slug: "python-output" },
            },
          ],
        },
      ),
    ).toMatchObject({
      subject: "python-v2",
      module: "python-v2-module-0",
      section: "python-v2-section-0",
      topic: "python-output",
      exerciseKey: "code-2",
      preferPurpose: "project",
      purposePolicy: "strict",
    });
  });
});
