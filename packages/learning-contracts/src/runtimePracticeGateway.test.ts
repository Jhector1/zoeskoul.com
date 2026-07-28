import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isLearningPracticeLaunchResponse,
  isLearningPracticeValidationResponse,
} from "./index";

const target = {
  version: 1 as const,
  sectionSlug: "section-1",
  topicSlug: "topic-1",
  ownerCardId: "quiz-1",
  targetKind: "card" as const,
  targetId: "quiz-1",
  runtimeKind: "quiz" as const,
};

describe("runtime practice gateway contracts", () => {
  it("accepts a learner-safe simple quiz launch", () => {
    expect(
      isLearningPracticeLaunchResponse({
        target,
        title: "Quick check",
        exercise: {
          id: "exercise-1",
          exerciseKey: "exercise-1",
          kind: "single_choice",
          title: "Question",
          prompt: "Choose one.",
          topic: "topic-1",
          difficulty: "easy",
          payload: {
            options: [
              {
                id: "a",
                label: "A",
              },
              {
                id: "b",
                label: "B",
              },
            ],
          },
        },
        key:
          "signed-practice-key-123456",
        sessionId: null,
        run: null,
        validationPath:
          "/api/student/runtime/practice/validate",
      }),
    ).toBe(true);
  });

  it("rejects a launch carrying answer material", () => {
    expect(
      isLearningPracticeLaunchResponse({
        target,
        title: "Unsafe",
        exercise: {
          id: "exercise-1",
          exerciseKey: "exercise-1",
          kind: "single_choice",
          title: "Question",
          prompt: "Choose one.",
          topic: "topic-1",
          difficulty: "easy",
          payload: {
            options: [],
            correctAnswer: "a",
          },
        },
        key:
          "signed-practice-key-123456",
        sessionId: null,
        run: null,
        validationPath:
          "/api/student/runtime/practice/validate",
      }),
    ).toBe(false);
  });

  it("accepts the projected validation response", () => {
    expect(
      isLearningPracticeValidationResponse({
        ok: true,
        message: null,
        code: null,
        explanation:
          "That is correct.",
        feedback: null,
        finalized: true,
        duplicate: false,
        attempts: {
          used: 1,
          max: null,
          left: null,
        },
        sessionComplete: false,
        requestId: "request-1",
      }),
    ).toBe(true);
  });
});
