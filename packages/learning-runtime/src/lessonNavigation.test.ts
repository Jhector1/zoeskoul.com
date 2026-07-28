import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ReviewProgressState,
} from "./index";
import {
  buildLessonAssessmentDoneProgress,
  buildLessonCardDoneProgress,
  canAutoCompleteLessonCard,
  isLessonCardComplete,
  isLessonTopicComplete,
  isLessonTopicUnlocked,
  nextLessonPosition,
  previousLessonPosition,
  resolveInitialLessonTopicSlug,
  withActiveLessonTopic,
} from "./lessonNavigation";

const topics = [
  {
    slug: "py8.intro",
    cards: [
      {
        type: "text" as const,
        id: "read-1",
        runtimeRequired: false,
      },
      {
        type: "video" as const,
        id: "video-1",
      },
    ],
  },
  {
    slug: "py8.practice",
    cards: [
      {
        type: "runtime" as const,
        id: "sketch-1",
        runtimeKind: "sketch" as const,
      },
      {
        type: "runtime" as const,
        id: "quiz-1",
        runtimeKind: "quiz" as const,
      },
    ],
  },
];

describe("lesson navigation contracts", () => {
  it("restores a prefixed lesson topic from a canonical saved topic id", () => {
    expect(
      resolveInitialLessonTopicSlug(
        topics,
        "intro",
      ),
    ).toBe("py8.intro");
  });

  it("persists active topics using canonical topic identity", () => {
    expect(
      withActiveLessonTopic(
        { topics: {} },
        "py8.practice",
      ).activeTopicId,
    ).toBe("practice");
  });

  it("auto-completes only reading and video cards without required runtime", () => {
    expect(
      canAutoCompleteLessonCard(
        topics[0].cards[0],
      ),
    ).toBe(true);
    expect(
      canAutoCompleteLessonCard({
        type: "text",
        id: "read-runtime",
        runtimeRequired: true,
      }),
    ).toBe(false);
    expect(
      canAutoCompleteLessonCard(
        topics[1].cards[0],
      ),
    ).toBe(false);
  });

  it("writes durable and legacy reading completion together", () => {
    const progress =
      buildLessonCardDoneProgress({
        progress: { topics: {} },
        topicSlug: "py8.intro",
        card: topics[0].cards[0],
        topics,
        now: "2026-07-27T12:00:00.000Z",
      });

    expect(
      progress.topics?.intro?.readingDone,
    ).toEqual({
      "read-1": true,
    });
    expect(
      progress.topics?.intro?.cardsDone,
    ).toEqual({
      "read-1": true,
    });
    expect(
      progress.topics?.intro?.completed,
    ).toBe(false);
  });

  it("marks an assessment complete through quizzesDone", () => {
    const progress =
      buildLessonAssessmentDoneProgress({
        progress: {
          topics: {
            intro: {
              completed: true,
            },
            practice: {
              readingDone: {
                "sketch-1": true,
              },
            },
          },
        },
        topicSlug: "py8.practice",
        card: topics[1].cards[1] as Extract<
          (typeof topics)[number]["cards"][number],
          { type: "runtime" }
        >,
        topics,
        now: "2026-07-28T12:00:00.000Z",
      });

    expect(
      progress.topics?.practice?.quizzesDone,
    ).toEqual({
      "quiz-1": true,
    });
    expect(
      progress.topics?.practice?.completed,
    ).toBe(true);
    expect(progress.moduleCompleted).toBe(true);
  });

  it("marks a topic complete when its final reading unit completes", () => {
    let progress: ReviewProgressState = {
      topics: {},
    };

    progress = buildLessonCardDoneProgress({
      progress,
      topicSlug: "py8.intro",
      card: topics[0].cards[0],
      topics,
      now: "2026-07-27T12:00:00.000Z",
    });
    progress = buildLessonCardDoneProgress({
      progress,
      topicSlug: "py8.intro",
      card: topics[0].cards[1],
      topics,
      now: "2026-07-27T12:01:00.000Z",
    });

    expect(
      progress.topics?.intro?.completed,
    ).toBe(true);
    expect(
      progress.topics?.intro?.completedAt,
    ).toBe("2026-07-27T12:01:00.000Z");
    expect(progress.moduleCompleted).toBe(false);
  });

  it("uses reading completion for sketches and assessment completion for quizzes", () => {
    const topic = {
      readingDone: {
        "sketch-1": true,
      },
      quizzesDone: {
        "quiz-1": true,
      },
    };

    expect(
      isLessonCardComplete(
        topics[1].cards[0],
        topic,
      ),
    ).toBe(true);
    expect(
      isLessonCardComplete(
        topics[1].cards[1],
        topic,
      ),
    ).toBe(true);
    expect(
      isLessonTopicComplete(
        topics[1].cards,
        topic,
      ),
    ).toBe(true);
  });

  it("does not complete a required embedded runtime reading from readingDone alone", () => {
    expect(
      isLessonCardComplete(
        {
          type: "text",
          id: "runtime-read",
          runtimeRequired: true,
        },
        {
          readingDone: {
            "runtime-read": true,
          },
        },
      ),
    ).toBe(false);
  });

  it("unlocks the first topic and gates the next topic on previous completion", () => {
    expect(
      isLessonTopicUnlocked({
        topics,
        topicIndex: 0,
        progress: { topics: {} },
      }),
    ).toBe(true);

    expect(
      isLessonTopicUnlocked({
        topics,
        topicIndex: 1,
        progress: { topics: {} },
      }),
    ).toBe(false);

    expect(
      isLessonTopicUnlocked({
        topics,
        topicIndex: 1,
        progress: {
          topics: {
            intro: {
              completed: true,
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("moves across card and topic boundaries semantically", () => {
    expect(
      nextLessonPosition({
        topics,
        current: {
          topicIndex: 0,
          cardIndex: 0,
        },
        allowNextTopic: false,
      }),
    ).toEqual({
      topicIndex: 0,
      cardIndex: 1,
    });

    expect(
      nextLessonPosition({
        topics,
        current: {
          topicIndex: 0,
          cardIndex: 1,
        },
        allowNextTopic: true,
      }),
    ).toEqual({
      topicIndex: 1,
      cardIndex: 0,
    });

    expect(
      previousLessonPosition(
        topics,
        {
          topicIndex: 1,
          cardIndex: 0,
        },
      ),
    ).toEqual({
      topicIndex: 0,
      cardIndex: 1,
    });
  });
});
