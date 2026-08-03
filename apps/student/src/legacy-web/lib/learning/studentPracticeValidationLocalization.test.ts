import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  hasForbiddenLearningPracticeFields,
  isLearningPracticeValidationResponse,
} from "@zoeskoul/learning-contracts";

import {
  localizeStudentPracticeValidation,
} from "./studentPracticeValidationLocalization";

const sourceCheckMessage =
  "@:topics.python-data-functions.module.topic.quiz.try-it.sourceChecks.0.message";

describe(
  "student practice validation localization",
  () => {
    it("projects secrets before resolving learner-visible feedback", async () => {
      let resolverInput: unknown = null;
      const resolveTagged =
        vi.fn(async (
          value: unknown,
        ) => {
          resolverInput = value;
          const body =
            value as Record<string, unknown>;
          const feedback =
            body.feedback as Record<string, unknown>;

          return {
            ...body,
            explanation:
              "Use numbers.append(10) to add the value.",
            feedback: {
              ...feedback,
              message:
                "Use numbers.append(10) to add the value.",
            },
          };
        });

      const result =
        await localizeStudentPracticeValidation(
          {
            ok: false,
            message: null,
            code: null,
            explanation:
              sourceCheckMessage,
            feedback: {
              area: "code",
              source: "check",
              kind: "logic",
              tone: "warning",
              title:
                "Not correct yet",
              message:
                sourceCheckMessage,
              expected: "SECRET",
            },
            finalized: false,
            duplicate: false,
            attempts: {
              used: 1,
              max: null,
              left: null,
            },
            sessionComplete: false,
            requestId: "request-1",
            expected: "SECRET",
          },
          resolveTagged,
        );

      expect(
        JSON.stringify(
          resolverInput,
        ),
      ).not.toContain("SECRET");
      expect(result).toMatchObject({
        ok: false,
        explanation:
          "Use numbers.append(10) to add the value.",
        feedback: {
          message:
            "Use numbers.append(10) to add the value.",
        },
      });
      expect(
        JSON.stringify(result),
      ).not.toContain("@:");
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

    it("replaces unresolved feedback keys with safe prose", async () => {
      const result =
        await localizeStudentPracticeValidation(
          {
            ok: false,
            message:
              sourceCheckMessage,
            code: null,
            explanation:
              sourceCheckMessage,
            feedback: {
              message:
                sourceCheckMessage,
            },
            finalized: false,
            duplicate: false,
            attempts: null,
            sessionComplete: false,
            requestId: "request-2",
          },
          async (value) => value,
        );

      expect(result).toMatchObject({
        message:
          "That answer is not correct yet.",
        explanation:
          "That answer is not correct yet.",
        feedback: {
          message:
            "That answer is not correct yet.",
        },
      });
      expect(
        JSON.stringify(result),
      ).not.toContain("@:");
    });
  },
);
