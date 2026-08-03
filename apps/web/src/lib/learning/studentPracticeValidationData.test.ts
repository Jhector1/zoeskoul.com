import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hasForbiddenLearningPracticeFields,
  isLearningPracticeValidationResponse,
} from "@zoeskoul/learning-contracts";

import {
  projectStudentPracticeValidation,
} from "./studentPracticeValidationData";

describe("student practice validation projection", () => {
  it("keeps feedback and attempt state while removing answer material", () => {
    const result =
      projectStudentPracticeValidation({
        ok: false,
        message: null,
        code: null,
        explanation:
          "Try comparing the values again.",
        feedback: {
          message:
            "Look at the second option.",
          expected:
            "SECRET",
          nested: {
            solutionCode:
              "SECRET",
          },
        },
        finalized: false,
        duplicate: false,
        attempts: {
          used: 1,
          max: 3,
          left: 2,
        },
        sessionComplete: false,
        requestId: "request-1",
        expected: "SECRET",
        revealAnswer: "SECRET",
      });

    expect(result).toMatchObject({
      ok: false,
      explanation:
        "Try comparing the values again.",
      finalized: false,
      attempts: {
        used: 1,
        max: 3,
        left: 2,
      },
      requestId: "request-1",
    });
    expect(
      JSON.stringify(result),
    ).not.toContain("SECRET");
    expect(
      isLearningPracticeValidationResponse(
        result,
      ),
    ).toBe(true);
    expect(
      hasForbiddenLearningPracticeFields(
        result,
      ),
    ).toBe(false);
  });
});
