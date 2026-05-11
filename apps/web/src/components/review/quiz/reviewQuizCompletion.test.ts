import { describe, expect, it } from "vitest";
import {
    computeReviewQuizCompletionSummary,
    isPracticeOutOfAttempts,
    shouldAutoCompleteReviewCard,
} from "./reviewQuizCompletion";

describe("computeReviewQuizCompletionSummary", () => {
    it("does not pass when all questions are checked but some answers are wrong", () => {
        const summary = computeReviewQuizCompletionSummary({
            passScore: 0.5,
            questions: [
                { id: "q1", checked: true, ok: true },
                { id: "q2", checked: true, ok: true },
                { id: "q3", checked: true, ok: false },
                { id: "q4", checked: true, ok: false },
            ],
        });

        expect(summary.checkedCount).toBe(4);
        expect(summary.correctCount).toBe(2);
        expect(summary.total).toBe(4);
        expect(summary.denom).toBe(4);
        expect(summary.score).toBe(0.5);
        expect(summary.allChecked).toBe(true);
        expect(summary.allCorrect).toBe(false);
        expect(summary.passed).toBe(false);
    });

    it("passes when every required question is checked and correct", () => {
        const summary = computeReviewQuizCompletionSummary({
            passScore: 0.5,
            questions: [
                { id: "q1", checked: true, ok: true },
                { id: "q2", checked: true, ok: true },
                { id: "q3", checked: true, ok: true },
                { id: "q4", checked: true, ok: true },
            ],
        });

        expect(summary.checkedCount).toBe(4);
        expect(summary.correctCount).toBe(4);
        expect(summary.total).toBe(4);
        expect(summary.score).toBe(1);
        expect(summary.allChecked).toBe(true);
        expect(summary.allCorrect).toBe(true);
        expect(summary.passed).toBe(true);
    });

    it("does not pass when correct answers exist but not all questions have been checked", () => {
        const summary = computeReviewQuizCompletionSummary({
            passScore: 0.5,
            questions: [
                { id: "q1", checked: true, ok: true },
                { id: "q2", checked: true, ok: true },
                { id: "q3", checked: false, ok: null },
                { id: "q4", checked: false, ok: null },
            ],
        });

        expect(summary.checkedCount).toBe(2);
        expect(summary.correctCount).toBe(2);
        expect(summary.total).toBe(4);
        expect(summary.allChecked).toBe(false);
        expect(summary.allCorrect).toBe(false);
        expect(summary.passed).toBe(false);
    });

    it("excludes excused questions from the required correctness denominator", () => {
        const summary = computeReviewQuizCompletionSummary({
            passScore: 1,
            questions: [
                { id: "q1", checked: true, ok: true },
                { id: "q2", checked: true, ok: true },
                { id: "q3", checked: false, ok: null, excused: true },
                { id: "q4", checked: false, ok: null, excused: true },
            ],
        });

        expect(summary.checkedCount).toBe(4);
        expect(summary.correctCount).toBe(2);
        expect(summary.total).toBe(4);
        expect(summary.denom).toBe(2);
        expect(summary.excusedCount).toBe(2);
        expect(summary.score).toBe(1);
        expect(summary.allChecked).toBe(true);
        expect(summary.allCorrect).toBe(true);
        expect(summary.passed).toBe(true);
    });

    it("does not pass an empty question list", () => {
        const summary = computeReviewQuizCompletionSummary({
            questions: [],
        });

        expect(summary.checkedCount).toBe(0);
        expect(summary.correctCount).toBe(0);
        expect(summary.total).toBe(0);
        expect(summary.denom).toBe(0);
        expect(summary.score).toBe(1);
        expect(summary.allChecked).toBe(false);
        expect(summary.allCorrect).toBe(true);
        expect(summary.passed).toBe(false);
    });

    it("can still support loose passScore mode when requireAllCorrect is false", () => {
        const summary = computeReviewQuizCompletionSummary({
            passScore: 0.5,
            requireAllCorrect: false,
            questions: [
                { id: "q1", checked: true, ok: true },
                { id: "q2", checked: true, ok: true },
                { id: "q3", checked: true, ok: false },
                { id: "q4", checked: true, ok: false },
            ],
        });

        expect(summary.score).toBe(0.5);
        expect(summary.allChecked).toBe(true);
        expect(summary.allCorrect).toBe(false);
        expect(summary.passed).toBe(true);
    });
});

describe("shouldAutoCompleteReviewCard", () => {
    it("does not auto-complete when the summary has not passed", () => {
        expect(
            shouldAutoCompleteReviewCard({
                prereqsMet: true,
                locked: false,
                isCompleted: false,
                summary: { passed: false },
            }),
        ).toBe(false);
    });

    it("auto-completes when prereqs are met, card is unlocked, not already completed, and summary passed", () => {
        expect(
            shouldAutoCompleteReviewCard({
                prereqsMet: true,
                locked: false,
                isCompleted: false,
                summary: { passed: true },
            }),
        ).toBe(true);
    });

    it("does not auto-complete when prereqs are missing", () => {
        expect(
            shouldAutoCompleteReviewCard({
                prereqsMet: false,
                locked: false,
                isCompleted: false,
                summary: { passed: true },
            }),
        ).toBe(false);
    });

    it("does not auto-complete when locked", () => {
        expect(
            shouldAutoCompleteReviewCard({
                prereqsMet: true,
                locked: true,
                isCompleted: false,
                summary: { passed: true },
            }),
        ).toBe(false);
    });

    it("does not auto-complete when already completed", () => {
        expect(
            shouldAutoCompleteReviewCard({
                prereqsMet: true,
                locked: false,
                isCompleted: true,
                summary: { passed: true },
            }),
        ).toBe(false);
    });
});

describe("isPracticeOutOfAttempts", () => {
    it("treats null maxAttempts as infinite attempts", () => {
        expect(
            isPracticeOutOfAttempts({
                attempts: 999,
                maxAttempts: null,
                unlimitedAttempts: false,
            }),
        ).toBe(false);
    });

    it("treats undefined maxAttempts as infinite attempts", () => {
        expect(
            isPracticeOutOfAttempts({
                attempts: 999,
                maxAttempts: undefined,
                unlimitedAttempts: false,
            }),
        ).toBe(false);
    });

    it("does not cap attempts when unlimitedAttempts is true", () => {
        expect(
            isPracticeOutOfAttempts({
                attempts: 999,
                maxAttempts: 3,
                unlimitedAttempts: true,
            }),
        ).toBe(false);
    });

    it("caps attempts when unlimitedAttempts is false and maxAttempts is reached", () => {
        expect(
            isPracticeOutOfAttempts({
                attempts: 3,
                maxAttempts: 3,
                unlimitedAttempts: false,
            }),
        ).toBe(true);
    });

    it("does not cap attempts before maxAttempts is reached", () => {
        expect(
            isPracticeOutOfAttempts({
                attempts: 2,
                maxAttempts: 3,
                unlimitedAttempts: false,
            }),
        ).toBe(false);
    });
});