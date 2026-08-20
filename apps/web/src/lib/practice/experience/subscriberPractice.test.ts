import { describe, expect, it } from "vitest";

import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  authoredPracticeHistoryExerciseKey,
  authoredPracticeTargetFromOption,
  resolveNextAuthoredPracticeTarget,
} from "./authoredPracticeQueue";
import {
  applySubscriberPracticeParams,
  buildSubscriberModulePracticeContinuationPlan,
  buildSubscriberPracticeMeta,
  isCompletedSubscriberModulePracticeMeta,
  isSameSubscriberPracticeScope,
  isSubscriberPracticeEligible,
  pickSubscriberPracticeQueue,
  readSubscriberPracticeMeta,
  shouldRetireStaleSubscriberModuleContinuationSession,
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
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
    ...overrides,
  };
}

describe("authored Practice history identity", () => {
  it("uses the authored payload id instead of the runtime-scoped exercise key", () => {
    expect(
      authoredPracticeHistoryExerciseKey({
        exerciseKey:
          "python-v2:python-v2-3:unknown:for-loops-over-text:standalone-standard:code-4",
        publicPayload: { id: "code-4" },
      }),
    ).toBe("code-4");
  });

  it("does not replay a runtime-scoped authored target as the next queue item", () => {
    const queue = [option("practice-a"), option("practice-b")].map(
      authoredPracticeTargetFromOption,
    );
    expect(
      resolveNextAuthoredPracticeTarget({
        queue,
        usedTargets: [
          {
            exerciseKey: "runtime:standalone-standard:practice-a",
            publicPayload: { id: "practice-a" },
            topic: { slug: "python-output" },
          },
        ],
      })?.exerciseKey,
    ).toBe("practice-b");
  });
});

describe("completed module Practice metadata", () => {
  const moduleScope = {
    subjectSlug: "python-v2",
    moduleSlug: "python-v2-module-0",
    sectionSlug: null,
    topicSlug: null,
  };

  const completedPrefix = [
    authoredPracticeTargetFromOption(
      option("done-a", { topicSlug: "topic-a" }),
    ),
    authoredPracticeTargetFromOption(
      option("done-b", { topicSlug: "topic-b" }),
    ),
  ];

  it("accepts a completed-prefix-only module continuation", () => {
    const meta = buildSubscriberPracticeMeta({
      queue: [],
      scope: moduleScope,
      completedPrefix,
      moduleTotal: completedPrefix.length,
    });

    expect(readSubscriberPracticeMeta(meta)).toMatchObject({
      planVersion: 2,
      targetCount: 0,
      queue: [],
      completedPrefix,
      moduleTotal: completedPrefix.length,
      scope: moduleScope,
    });
    expect(
      isCompletedSubscriberModulePracticeMeta({
        meta,
        moduleTotal: completedPrefix.length,
        completedPrefix,
      }),
    ).toBe(true);
  });

  it("rejects an empty queue when the module is not actually complete", () => {
    const meta = buildSubscriberPracticeMeta({
      queue: [],
      scope: moduleScope,
      completedPrefix,
      moduleTotal: completedPrefix.length + 1,
    });

    expect(readSubscriberPracticeMeta(meta)).toBeNull();
  });

  it("does not match a different completed prefix", () => {
    const meta = buildSubscriberPracticeMeta({
      queue: [],
      scope: moduleScope,
      completedPrefix,
      moduleTotal: completedPrefix.length,
    });

    expect(
      isCompletedSubscriberModulePracticeMeta({
        meta,
        moduleTotal: completedPrefix.length,
        completedPrefix: [
          authoredPracticeTargetFromOption(
            option("different", { topicSlug: "topic-a" }),
          ),
          completedPrefix[1],
        ],
      }),
    ).toBe(false);
  });
});

describe("module Practice stale continuation retirement", () => {
  const moduleScope = {
    subjectSlug: "python-v2",
    moduleSlug: "python-v2-module-0",
    sectionSlug: null,
    topicSlug: null,
  };

  const staleMeta = buildSubscriberPracticeMeta({
    queue: [
      authoredPracticeTargetFromOption(
        option("already-done", { topicSlug: "topic-a" }),
      ),
      authoredPracticeTargetFromOption(
        option("remaining", { topicSlug: "topic-b" }),
      ),
    ],
    scope: moduleScope,
    completedPrefix: [],
    moduleTotal: 2,
  });

  it("retires a zero-progress module run when another Practice session completed a queued target", () => {
    expect(
      shouldRetireStaleSubscriberModuleContinuationSession({
        sessionId: "active-module-session",
        total: 0,
        meta: staleMeta,
        history: [
          {
            exerciseKey: "already-done",
            topicSlug: "topic-a",
            seenAt: new Date("2026-08-18T10:00:00Z"),
            completedAt: new Date("2026-08-18T10:00:00Z"),
            sessionId: "header-topic-session",
          },
        ],
      }),
    ).toBe(true);
  });

  it("does not retire when the completion belongs to the same active session", () => {
    expect(
      shouldRetireStaleSubscriberModuleContinuationSession({
        sessionId: "active-module-session",
        total: 0,
        meta: staleMeta,
        history: [
          {
            exerciseKey: "already-done",
            topicSlug: "topic-a",
            seenAt: new Date("2026-08-18T10:00:00Z"),
            completedAt: new Date("2026-08-18T10:00:00Z"),
            sessionId: "active-module-session",
          },
        ],
      }),
    ).toBe(false);
  });

  it("never retires a module run that already has learner progress of its own", () => {
    expect(
      shouldRetireStaleSubscriberModuleContinuationSession({
        sessionId: "active-module-session",
        total: 1,
        meta: staleMeta,
        history: [
          {
            exerciseKey: "already-done",
            topicSlug: "topic-a",
            seenAt: new Date("2026-08-18T10:00:00Z"),
            completedAt: new Date("2026-08-18T10:00:00Z"),
            sessionId: "header-topic-session",
          },
        ],
      }),
    ).toBe(false);
  });

  it("does not retire an already canonical module continuation with a completed prefix", () => {
    const canonicalMeta = buildSubscriberPracticeMeta({
      queue: [
        authoredPracticeTargetFromOption(
          option("remaining", { topicSlug: "topic-b" }),
        ),
      ],
      scope: moduleScope,
      completedPrefix: [
        authoredPracticeTargetFromOption(
          option("already-done", { topicSlug: "topic-a" }),
        ),
      ],
      moduleTotal: 2,
    });

    expect(
      shouldRetireStaleSubscriberModuleContinuationSession({
        sessionId: "active-module-session",
        total: 0,
        meta: canonicalMeta,
        history: [
          {
            exerciseKey: "already-done",
            topicSlug: "topic-a",
            seenAt: new Date("2026-08-18T10:00:00Z"),
            completedAt: new Date("2026-08-18T10:00:00Z"),
            sessionId: "header-topic-session",
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("subscriber authored practice queue", () => {
  it("includes only authored lesson exercises whose purpose is practice", () => {
    expect(isSubscriberPracticeEligible(option("practice"))).toBe(true);
    expect(
      isSubscriberPracticeEligible(
        option("terminal-practice", { requiresTerminal: true }),
      ),
    ).toBe(true);
    expect(
      isSubscriberPracticeEligible(
        option("quiz", {
          exercisePurpose: "quiz",
          exerciseKind: "single_choice",
        }),
      ),
    ).toBe(false);
    expect(
      isSubscriberPracticeEligible(
        option("try-it", {
          exercisePurpose: "try_it",
          isStandaloneTryIt: true,
        }),
      ),
    ).toBe(false);
    expect(
      isSubscriberPracticeEligible(
        option("project", { exercisePurpose: "project" }),
      ),
    ).toBe(false);
  });

  it("builds a module-scoped queue balanced across topics", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [
        option("a-1", { topicSlug: "topic-a" }),
        option("a-2", { topicSlug: "topic-a" }),
        option("a-3", { topicSlug: "topic-a" }),
        option("b-1", { topicSlug: "topic-b" }),
        option("b-2", { topicSlug: "topic-b" }),
        option("c-1", { topicSlug: "topic-c" }),
        option("other-module", {
          moduleSlug: "python-v2-module-1",
          topicSlug: "topic-z",
        }),
      ],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      targetCount: 5,
      seed: "learner|module|day",
    });

    expect(queue).toHaveLength(5);
    expect(queue.every((target) => target.exercisePurpose === "practice")).toBe(
      true,
    );
    expect(new Set(queue.map((target) => target.topicSlug)).size).toBe(3);
    expect(
      new Set(queue.slice(0, 3).map((target) => target.topicSlug)).size,
    ).toBe(3);
  });

  it("treats topic and section selection as a hard candidate boundary", () => {
    const options = [
      option("a-1", { topicSlug: "topic-a", sectionSlug: "section-a" }),
      option("a-2", { topicSlug: "topic-a", sectionSlug: "section-a" }),
      option("b-1", { topicSlug: "topic-b", sectionSlug: "section-a" }),
      option("c-1", { topicSlug: "topic-c", sectionSlug: "section-c" }),
    ];

    const topicQueue = pickSubscriberPracticeQueue({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "section-a",
      topicSlug: "topic-a",
      targetCount: 10,
      seed: "topic-scope",
    });
    const sectionQueue = pickSubscriberPracticeQueue({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "section-a",
      targetCount: 10,
      seed: "section-scope",
    });

    expect(topicQueue.map((target) => target.exerciseKey).sort()).toEqual([
      "a-1",
      "a-2",
    ]);
    expect(sectionQueue.map((target) => target.exerciseKey).sort()).toEqual([
      "a-1",
      "a-2",
      "b-1",
    ]);
  });

  it("exhausts unseen exercises before repeating previously seen work", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [
        option("seen-a", { topicSlug: "topic-a" }),
        option("unseen-a", { topicSlug: "topic-a" }),
        option("unseen-b", { topicSlug: "topic-b" }),
        option("seen-b", { topicSlug: "topic-b" }),
      ],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      targetCount: 4,
      seed: "history",
      history: [
        {
          exerciseKey: "seen-a",
          topicSlug: "topic-a",
          seenAt: "2026-08-16T12:00:00.000Z",
        },
        {
          exerciseKey: "seen-b",
          topicSlug: "topic-b",
          seenAt: "2026-08-15T12:00:00.000Z",
        },
      ],
    });

    expect(queue.slice(0, 2).map((target) => target.exerciseKey).sort()).toEqual(
      ["unseen-a", "unseen-b"],
    );
    expect(queue.slice(2).map((target) => target.exerciseKey).sort()).toEqual([
      "seen-a",
      "seen-b",
    ]);
  });

  it("shares history across entry origins while keeping the requested scope", () => {
    const options = [
      option("seen-topic-a", {
        sectionSlug: "section-a",
        topicSlug: "topic-a",
      }),
      option("unseen-topic-a", {
        sectionSlug: "section-a",
        topicSlug: "topic-a",
      }),
      option("unseen-topic-b", {
        sectionSlug: "section-b",
        topicSlug: "topic-b",
      }),
    ];
    const history = [
      {
        exerciseKey: "seen-topic-a",
        topicSlug: "topic-a",
        seenAt: "2026-08-16T12:00:00.000Z",
      },
    ];

    const moduleEntry = pickSubscriberPracticeQueue({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      targetCount: 1,
      history,
      seed: "shared-history-module",
    });
    const topicEntry = pickSubscriberPracticeQueue({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "section-a",
      topicSlug: "topic-a",
      targetCount: 1,
      history,
      seed: "shared-history-topic",
    });

    expect(moduleEntry[0]?.exerciseKey).not.toBe("seen-topic-a");
    expect(topicEntry.map((target) => target.exerciseKey)).toEqual([
      "unseen-topic-a",
    ]);
  });

  it("builds module continuation with completed targets first and every remaining target queued", () => {
    const options = [
      option("done-a", { sectionSlug: "section-a", topicSlug: "topic-a" }),
      option("remaining-a", { sectionSlug: "section-a", topicSlug: "topic-a" }),
      option("done-b", { sectionSlug: "section-b", topicSlug: "topic-b" }),
      option("remaining-b", { sectionSlug: "section-b", topicSlug: "topic-b" }),
    ];
    const history = [
      {
        exerciseKey: "done-a",
        topicSlug: "topic-a",
        seenAt: "2026-08-16T12:00:00.000Z",
        completedAt: "2026-08-16T12:00:00.000Z",
      },
      {
        exerciseKey: "done-b",
        topicSlug: "topic-b",
        seenAt: "2026-08-15T12:00:00.000Z",
        completedAt: "2026-08-15T12:00:00.000Z",
      },
    ];

    const plan = buildSubscriberModulePracticeContinuationPlan({
      options,
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      history,
      seed: "module-continuation",
    });

    expect(plan.moduleTotal).toBe(4);
    expect(plan.completedPrefix.map((target) => target.exerciseKey)).toEqual([
      "done-a",
      "done-b",
    ]);
    expect(plan.queue.map((target) => target.exerciseKey).sort()).toEqual([
      "remaining-a",
      "remaining-b",
    ]);
  });

  it("prefers the least-recently seen exercise after the module is exhausted", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [
        option("recent", { topicSlug: "topic-a" }),
        option("old", { topicSlug: "topic-a" }),
      ],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      targetCount: 1,
      seed: "all-seen",
      history: [
        {
          exerciseKey: "recent",
          topicSlug: "topic-a",
          seenAt: "2026-08-16T12:00:00.000Z",
        },
        {
          exerciseKey: "old",
          topicSlug: "topic-a",
          seenAt: "2026-08-01T12:00:00.000Z",
        },
      ],
    });

    expect(queue.map((target) => target.exerciseKey)).toEqual(["old"]);
  });

  it("preserves explicit module scope in metadata and legacy topic scope", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [
        option("practice-1", { topicSlug: "topic-a" }),
        option("practice-2", { topicSlug: "topic-b" }),
      ],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      targetCount: 10,
      seed: "meta",
    });
    const moduleScope = {
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: null,
      topicSlug: null,
    };
    const meta = buildSubscriberPracticeMeta({
      queue,
      scope: moduleScope,
      lastOpenedAt: "2026-07-22T18:00:00.000Z",
    });

    expect(subscriberPracticeScopeFromMeta(meta)).toEqual(moduleScope);
    expect(readSubscriberPracticeMeta(meta)?.lastOpenedAt).toBe(
      "2026-07-22T18:00:00.000Z",
    );

    const legacyMeta = {
      kind: "subscriber_practice",
      targetCount: 1,
      queue: [
        option("legacy", {
          sectionSlug: "legacy-section",
          topicSlug: "legacy-topic",
        }),
      ],
    };
    expect(subscriberPracticeScopeFromMeta(legacyMeta)).toEqual({
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: "legacy-section",
      topicSlug: "legacy-topic",
    });
  });

  it("preserves module continuation display metadata when touched", () => {
    const queue = [option("remaining")].map((item) =>
      authoredPracticeTargetFromOption(item),
    );
    const completedPrefix = [option("done")].map((item) =>
      authoredPracticeTargetFromOption(item),
    );
    const meta = buildSubscriberPracticeMeta({
      queue,
      completedPrefix,
      moduleTotal: 2,
      scope: {
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-module-0",
        sectionSlug: null,
        topicSlug: null,
      },
      lastOpenedAt: "2026-08-18T12:00:00.000Z",
    });

    expect(readSubscriberPracticeMeta(touchSubscriberPracticeMeta(meta))?.completedPrefix)
      .toEqual(completedPrefix);
    expect(readSubscriberPracticeMeta(meta)?.moduleTotal).toBe(2);
    expect(readSubscriberPracticeMeta(meta)?.planVersion).toBe(2);
  });

  it("compares module scope separately from focused section/topic scope", () => {
    const moduleScope = {
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      sectionSlug: null,
      topicSlug: null,
    };

    expect(isSameSubscriberPracticeScope(moduleScope, moduleScope)).toBe(true);
    expect(
      isSameSubscriberPracticeScope(moduleScope, {
        ...moduleScope,
        sectionSlug: "section-a",
        topicSlug: "topic-a",
      }),
    ).toBe(false);
  });

  it("locks every request to the next exact authored practice target", () => {
    const queue = pickSubscriberPracticeQueue({
      options: [option("practice-1"), option("practice-2")],
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-module-0",
      targetCount: 10,
      seed: "next",
    });
    const meta = buildSubscriberPracticeMeta({ queue });

    expect(
      applySubscriberPracticeParams(
        { sessionId: "session-1" },
        {
          id: "session-1",
          meta,
          instances: [
            {
              exerciseKey: queue[0]?.exerciseKey,
              topic: { slug: queue[0]?.topicSlug },
            },
          ],
        },
      ),
    ).toMatchObject({
      subject: "python-v2",
      module: "python-v2-module-0",
      section: queue[1]?.sectionSlug,
      topic: queue[1]?.topicSlug,
      exerciseKey: queue[1]?.exerciseKey,
      preferPurpose: "practice",
      purposePolicy: "strict",
    });
  });

  it("continues to normalize legacy stored quiz/project queue purposes", () => {
    const meta = {
      kind: "subscriber_practice",
      targetCount: 2,
      queue: [
        option("legacy-quiz", {
          exercisePurpose: "quiz",
          exerciseKind: "single_choice",
        }),
        option("legacy-project", { exercisePurpose: "project" }),
      ],
    };

    expect(
      readSubscriberPracticeMeta(meta)?.queue.map(
        (target) => target.exercisePurpose,
      ),
    ).toEqual(["quiz", "project"]);
  });
});
