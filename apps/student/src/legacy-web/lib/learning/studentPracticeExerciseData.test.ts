import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hasForbiddenLearningPracticeFields,
  isLearningPracticeExercise,
} from "@zoeskoul/learning-contracts";

import {
  projectStudentPracticeExercise,
} from "./studentPracticeExerciseData";

describe("projectStudentPracticeExercise", () => {
  it("keeps learner-visible code starter data and strips grading data", () => {
    const result = projectStudentPracticeExercise({
      id: "code-1",
      exerciseKey: "code-1",
      kind: "code_input",
      topic: "py1.files",
      difficulty: "easy",
      title: "Create a file",
      prompt: "Create main.py.",
      language: "python",
      starterCode: "# Start here\n",
      starterFiles: [
        {
          path: "main.py",
          content: "# Start here\n",
          solutionCode: "print('secret')",
        },
      ],
      workspace: {
        entryFilePath: "main.py",
        starterFiles: [
          {
            path: "main.py",
            content: "# Start here\n",
          },
        ],
        hiddenTests: ["secret test"],
      },
      expectedExample: {
        kind: "terminal",
        stdout: "Hello\n",
      },
      recipe: {
        solutionCode: "print('secret')",
      },
      tests: ["secret test"],
      solutionCode: "print('secret')",
      solutionFiles: [
        {
          path: "main.py",
          content: "print('secret')",
        },
      ],
      expected: {
        kind: "programming",
      },
      secretPayload: {
        answerKey: "secret",
      },
    });

    expect(result).toMatchObject({
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
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# Start here\n",
            },
          ],
        },
        expectedExample: {
          kind: "terminal",
          stdout: "Hello\n",
        },
      },
    });

    expect(
      hasForbiddenLearningPracticeFields(result),
    ).toBe(false);
    expect(
      isLearningPracticeExercise(result),
    ).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("solutionCode");
    expect(serialized).not.toContain("solutionFiles");
    expect(serialized).not.toContain("hiddenTests");
    expect(serialized).not.toContain('"tests"');
    expect(serialized).not.toContain('"recipe"');
    expect(serialized).not.toContain('"expected"');
    expect(serialized).not.toContain("secretPayload");
  });

  it("removes numeric answers while keeping public tolerance", () => {
    const result = projectStudentPracticeExercise({
      id: "numeric-1",
      kind: "numeric",
      topic: "math.sum",
      difficulty: "medium",
      title: "Add",
      prompt: "What is 2 + 2?",
      tolerance: 0,
      correctValue: 4,
      answer: 4,
    });

    expect(result.payload).toEqual({
      tolerance: 0,
    });
  });

  it("keeps choice labels without accepting answer metadata", () => {
    const result = projectStudentPracticeExercise({
      id: "choice-1",
      kind: "single_choice",
      topic: "py1.variables",
      difficulty: "easy",
      title: "Choose",
      prompt: "Which is valid?",
      options: [
        {
          id: "a",
          text: "x = 1",
          correct: true,
        },
        {
          id: "b",
          label: "1 = x",
          correct: false,
        },
      ],
      answerId: "a",
    });

    expect(result.payload).toEqual({
      options: [
        {
          id: "a",
          label: "x = 1",
        },
        {
          id: "b",
          label: "1 = x",
        },
      ],
    });
  });
});
