import { describe, expect, it } from "vitest";
import { RetryableTopicValidationError } from "../validate/RetryableTopicValidationError.js";
import { extractRetryIssues } from "./topicRetryContext.js";

describe("extractRetryIssues", () => {
    it("keeps critique warnings that explain how to repair a fatal count failure", () => {
        const error = new RetryableTopicValidationError({
            code: "CRITIQUE_VALIDATION_FAILED",
            message: "Expected at least 5 non-code quizzes, but the draft has 4.",
            details: {
                issues: [
                    {
                        code: "QUIZ_BANK_TOO_SMALL",
                        severity: "error",
                        message: "Expected at least 5 non-code quiz exercise(s), but the draft has 4.",
                    },
                    {
                        code: "EXERCISE_POLICY_KIND_UNDER_TARGET",
                        severity: "warn",
                        message: 'Exercise policy targets 2 "single_choice" exercise(s), but the draft has 1.',
                    },
                    {
                        code: "EXERCISE_POLICY_KIND_UNDER_TARGET",
                        severity: "warn",
                        message: 'Exercise policy targets 2 "multi_choice" exercise(s), but the draft has 1.',
                    },
                ],
            },
        });

        expect(extractRetryIssues(error)).toEqual([
            {
                code: "QUIZ_BANK_TOO_SMALL",
                message: "Expected at least 5 non-code quiz exercise(s), but the draft has 4.",
            },
            {
                code: "EXERCISE_POLICY_KIND_UNDER_TARGET",
                message: 'Exercise policy targets 2 "single_choice" exercise(s), but the draft has 1.',
            },
            {
                code: "EXERCISE_POLICY_KIND_UNDER_TARGET",
                message: 'Exercise policy targets 2 "multi_choice" exercise(s), but the draft has 1.',
            },
        ]);
    });

    it("maps repair fields to exerciseId and removes duplicates", () => {
        const error = new RetryableTopicValidationError({
            code: "REPAIR_FAILED",
            message: "Repair failed.",
            details: {
                repairs: [
                    {
                        code: "STARTER_REVEALS_SOLUTION",
                        field: "try-topic-sketch0",
                        severity: "warning",
                        message: "Starter code reveals the solution.",
                    },
                    {
                        code: "STARTER_REVEALS_SOLUTION",
                        field: "try-topic-sketch0",
                        severity: "warning",
                        message: "Starter code reveals the solution.",
                    },
                ],
            },
        });

        expect(extractRetryIssues(error)).toEqual([
            {
                code: "STARTER_REVEALS_SOLUTION",
                exerciseId: "try-topic-sketch0",
                message: "Starter code reveals the solution.",
            },
        ]);
    });

    it("returns undefined for non-retryable errors or empty details", () => {
        expect(extractRetryIssues(new Error("no"))).toBeUndefined();
        expect(
            extractRetryIssues(
                new RetryableTopicValidationError({
                    code: "EMPTY",
                    message: "empty",
                    details: { issues: [] },
                }),
            ),
        ).toBeUndefined();
    });
});
