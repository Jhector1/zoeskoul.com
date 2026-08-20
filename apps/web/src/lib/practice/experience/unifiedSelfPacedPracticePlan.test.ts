import { describe, expect, it } from "vitest";

import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  buildSubscriberPracticeMeta,
  buildSubscriberPracticePlan,
  readSubscriberPracticeMeta,
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
    moduleSlug: "python-v2-1",
    moduleTitle: "Variables, Input, and Strings",
    sectionSlug: "section-a",
    sectionTitle: "Variables",
    sectionRole: "lesson",
    topicSlug: "topic-a",
    topicTitle: "Topic A",
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

describe("one self-paced Practice planner for every entry origin", () => {
  const options = [
    option("done-a"),
    option("remaining-a"),
    option("done-b", {
      sectionSlug: "section-b",
      topicSlug: "topic-b",
      topicTitle: "Topic B",
    }),
    option("remaining-b", {
      sectionSlug: "section-b",
      topicSlug: "topic-b",
      topicTitle: "Topic B",
    }),
  ];

  const sharedHistory = [
    {
      exerciseKey: "done-a",
      topicSlug: "topic-a",
      seenAt: "2026-08-20T06:00:00.000Z",
      completedAt: "2026-08-20T06:00:00.000Z",
      sessionId: "header-origin",
    },
    {
      exerciseKey: "done-b",
      topicSlug: "topic-b",
      seenAt: "2026-08-20T06:10:00.000Z",
      completedAt: "2026-08-20T06:10:00.000Z",
      sessionId: "lesson-origin",
    },
  ];

  it("uses module scope for Lesson/Review without a second planner", () => {
    const plan = buildSubscriberPracticePlan({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: null,
      topicSlug: null,
      targetCount: null,
      history: sharedHistory,
      seed: "lesson-module",
    });

    expect(plan.moduleTotal).toBe(4);
    expect(plan.completedPrefix.map((item) => item.exerciseKey)).toEqual([
      "done-a",
      "done-b",
    ]);
    expect(plan.queue.map((item) => item.exerciseKey).sort()).toEqual([
      "remaining-a",
      "remaining-b",
    ]);
  });

  it("uses the same planner for a Header-selected topic scope", () => {
    const plan = buildSubscriberPracticePlan({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: "section-b",
      topicSlug: "topic-b",
      targetCount: 2,
      history: sharedHistory,
      seed: "header-topic",
    });

    expect(plan.moduleTotal).toBe(2);
    expect(plan.completedPrefix.map((item) => item.exerciseKey)).toEqual([
      "done-b",
    ]);
    expect(plan.queue.map((item) => item.exerciseKey)).toEqual([
      "remaining-b",
    ]);
  });

  it("allows a fully completed focused scope to use the same completed-prefix metadata", () => {
    const plan = buildSubscriberPracticePlan({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-1",
      sectionSlug: "section-b",
      topicSlug: "topic-b",
      targetCount: null,
      history: [
        ...sharedHistory,
        {
          exerciseKey: "remaining-b",
          topicSlug: "topic-b",
          seenAt: "2026-08-20T06:20:00.000Z",
          completedAt: "2026-08-20T06:20:00.000Z",
          sessionId: "header-origin-2",
        },
      ],
      seed: "header-topic-complete",
    });

    expect(plan.moduleTotal).toBe(2);
    expect(plan.queue).toEqual([]);
    expect(plan.completedPrefix).toHaveLength(2);

    const meta = buildSubscriberPracticeMeta({
      queue: plan.queue,
      scope: {
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "section-b",
        topicSlug: "topic-b",
      },
      completedPrefix: plan.completedPrefix,
      moduleTotal: plan.moduleTotal,
    });

    expect(readSubscriberPracticeMeta(meta)).toMatchObject({
      targetCount: 0,
      moduleTotal: 2,
      scope: {
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "section-b",
        topicSlug: "topic-b",
      },
    });
  });
});
