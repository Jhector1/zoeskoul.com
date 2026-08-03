import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hasForbiddenLearningPracticeFields,
  isLearningPracticeExercise,
} from "./index";

describe("learner-safe practice exercise contract", () => {
  it("accepts a learner-visible code exercise", () => {
    expect(
      isLearningPracticeExercise({
        id: "code-1",
        exerciseKey: "code-1",
        kind: "code_input",
        topic: "py1.files",
        difficulty: "easy",
        title: "Create a file",
        prompt: "Create main.py.",
        payload: {
          language: "python",
          starterCode: "# Start here\n",
          starterFiles: [
            {
              path: "main.py",
              content: "# Start here\n",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it.each([
    "answer",
    "answerId",
    "answerKey",
    "checkSql",
    "correct",
    "correctAnswer",
    "correctValue",
    "expected",
    "expectedAnswerPayload",
    "expectedSolution",
    "hiddenTests",
    "recipe",
    "reveal",
    "revealAnswer",
    "secretPayload",
    "solutionCode",
    "solutionFiles",
    "sourceChecks",
    "tests",
  ])("rejects the forbidden field %s recursively", (field) => {
    const value = {
      id: "code-1",
      exerciseKey: "code-1",
      kind: "code_input",
      topic: "py1.files",
      difficulty: "easy",
      title: "Create a file",
      prompt: "Create main.py.",
      payload: {
        workspace: {
          nested: {
            [field]: "secret",
          },
        },
      },
    };

    expect(
      hasForbiddenLearningPracticeFields(value),
    ).toBe(true);
    expect(
      isLearningPracticeExercise(value),
    ).toBe(false);
  });
});
