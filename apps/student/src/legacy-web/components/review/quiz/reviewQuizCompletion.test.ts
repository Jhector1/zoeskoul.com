import { describe, expect, it } from "vitest";
import {
    computeReviewQuizCompletionSummary,
    isPracticeOutOfAttempts,
    resolveReviewCardAutoCompletionReason,
    resolveReviewFinalizedNavigationAction,
    resolveReviewFinalizedPracticeAction,
    shouldAutoCompleteReviewCard,
    shouldFinalizeReviewCardFromManualNext,
} from "./reviewQuizCompletion";


describe("resolveReviewFinalizedNavigationAction", () => {
    it("uses Finish only for the final question on the final topic card", () => {
        expect(
            resolveReviewFinalizedNavigationAction({
                isLastQuestion: false,
                isLastTopicCard: false,
            }),
        ).toBe("next");
        expect(
            resolveReviewFinalizedNavigationAction({
                isLastQuestion: true,
                isLastTopicCard: false,
            }),
        ).toBe("next");
        expect(
            resolveReviewFinalizedNavigationAction({
                isLastQuestion: false,
                isLastTopicCard: true,
            }),
        ).toBe("next");
        expect(
            resolveReviewFinalizedNavigationAction({
                isLastQuestion: true,
                isLastTopicCard: true,
            }),
        ).toBe("finish");
    });
});

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

describe("resolveReviewCardAutoCompletionReason", () => {
    const base = {
        prereqsMet: true,
        locked: false,
        isCompleted: false,
        summary: { passed: false },
        allQuestionsFlowDone: true,
        hasFinalizedZeroCreditQuestion: true,
        terminalQuestionOk: true as boolean | null,
        terminalFinalizedActionConsumed: false,
    };

    it("keeps all-correct completion on the passed/credit path", () => {
        expect(
            resolveReviewCardAutoCompletionReason({
                ...base,
                summary: { passed: true },
                hasFinalizedZeroCreditQuestion: false,
            }),
        ).toBe("passed");
    });

    it("finalizes a project when an earlier step was revealed and the last step is correct", () => {
        expect(resolveReviewCardAutoCompletionReason(base)).toBe("finalized");
    });

    it("waits for the explicit Finish click when the terminal revealed action is not consumed", () => {
        expect(
            resolveReviewCardAutoCompletionReason({
                ...base,
                terminalQuestionOk: false,
                terminalFinalizedActionConsumed: false,
            }),
        ).toBeNull();
    });

    it("repairs completion after a consumed terminal reveal remount", () => {
        expect(
            resolveReviewCardAutoCompletionReason({
                ...base,
                terminalQuestionOk: false,
                terminalFinalizedActionConsumed: true,
            }),
        ).toBe("finalized");
    });

    it("does not finalize without a zero-credit finalized step", () => {
        expect(
            resolveReviewCardAutoCompletionReason({
                ...base,
                hasFinalizedZeroCreditQuestion: false,
            }),
        ).toBeNull();
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


describe("shouldFinalizeReviewCardFromManualNext", () => {
    it("finalizes only from the last resolved question", () => {
        expect(
            shouldFinalizeReviewCardFromManualNext({
                prereqsMet: true,
                locked: false,
                isCompleted: false,
                isLast: true,
                allQuestionsFlowDone: true,
            }),
        ).toBe(true);

        expect(
            shouldFinalizeReviewCardFromManualNext({
                prereqsMet: true,
                locked: false,
                isCompleted: false,
                isLast: false,
                allQuestionsFlowDone: true,
            }),
        ).toBe(false);

        expect(
            shouldFinalizeReviewCardFromManualNext({
                prereqsMet: true,
                locked: false,
                isCompleted: false,
                isLast: true,
                allQuestionsFlowDone: false,
            }),
        ).toBe(false);
    });

    it("does not finalize locked, completed, or gated cards", () => {
        const base = {
            prereqsMet: true,
            locked: false,
            isCompleted: false,
            isLast: true,
            allQuestionsFlowDone: true,
        };

        expect(
            shouldFinalizeReviewCardFromManualNext({
                ...base,
                prereqsMet: false,
            }),
        ).toBe(false);
        expect(
            shouldFinalizeReviewCardFromManualNext({
                ...base,
                locked: true,
            }),
        ).toBe(false);
        expect(
            shouldFinalizeReviewCardFromManualNext({
                ...base,
                isCompleted: true,
            }),
        ).toBe(false);
    });
});

describe("resolveReviewFinalizedPracticeAction", () => {
    const base = {
        action: "next" as const,
        revealed: true,
        correct: false,
        unlocked: true,
        locked: false,
        excused: false,
        hasHandler: true,
    };

    it("returns Next or Finish for a revealed zero-credit item", () => {
        expect(resolveReviewFinalizedPracticeAction(base)).toBe("next");
        expect(
            resolveReviewFinalizedPracticeAction({
                ...base,
                action: "finish",
            }),
        ).toBe("finish");
    });

    it("does not expose a terminal action for non-reveal or blocked states", () => {
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, revealed: false }),
        ).toBeNull();
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, correct: true }),
        ).toBeNull();
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, unlocked: false }),
        ).toBeNull();
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, locked: true }),
        ).toBeNull();
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, excused: true }),
        ).toBeNull();
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, hasHandler: false }),
        ).toBeNull();
        expect(
            resolveReviewFinalizedPracticeAction({ ...base, action: null }),
        ).toBeNull();
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