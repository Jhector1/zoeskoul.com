import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isLearningPracticeLaunchResponse,
  isLearningPracticeValidationResponse,
  isLearningSimplePracticeAnswer,
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

const embeddedTarget = {
  version: 1 as const,
  sectionSlug: "section-1",
  topicSlug: "dictionary-basics",
  ownerCardId: "sketch0",
  targetKind: "embedded_try_it" as const,
  targetId: "try-dictionary-basics-sketch0",
  runtimeKind: "try_it" as const,
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

  it("accepts a learner-safe embedded Python Try It launch", () => {
    expect(
      isLearningPracticeLaunchResponse({
        target: embeddedTarget,
        title: "Try dictionaries",
        exercise: {
          id: "try-dictionary-basics-sketch0",
          exerciseKey: "try-dictionary-basics-sketch0",
          kind: "code_input",
          title: "Try dictionaries",
          prompt: "Create and read a dictionary.",
          topic: "dictionary-basics",
          difficulty: "easy",
          payload: {
            language: "python",
            starterFiles: [
              { path: "main.py", content: "profile = {}\n" },
            ],
            workspace: {
              entryFilePath: "main.py",
              starterFiles: [
                { path: "main.py", content: "profile = {}\n" },
              ],
            },
          },
        },
        key: "signed-practice-key-123456",
        sessionId: null,
        run: null,
        validationPath: "/api/student/runtime/practice/validate",
      }),
    ).toBe(true);
  });

  it("accepts the one-file code-input answer contract", () => {
    expect(
      isLearningSimplePracticeAnswer({
        kind: "code_input",
        language: "python",
        code: "print('Ava')\n",
        entry: "main.py",
        files: [
          {
            kind: "file",
            path: "main.py",
            content: "print('Ava')\n",
          },
        ],
      }),
    ).toBe(true);

    expect(
      isLearningSimplePracticeAnswer({
        kind: "code_input",
        language: "javascript",
        code: "console.log('Ava')",
      }),
    ).toBe(false);
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
