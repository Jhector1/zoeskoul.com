export type ReviewAssessmentCompletionReason = "passed" | "finalized";
export type ReviewFinalizedPracticeAction = "next" | "finish";

/**
 * A revealed practice item only says Finish when both the practice item and
 * its containing topic card are terminal. Finishing an inner one-question
 * Try It on an earlier topic card must still read Next because the learner has
 * more topic content ahead.
 */
export function resolveReviewFinalizedNavigationAction(args: {
    isLastQuestion: boolean;
    isLastTopicCard: boolean;
}): ReviewFinalizedPracticeAction {
    return args.isLastQuestion && args.isLastTopicCard ? "finish" : "next";
}

export type ReviewQuizCompletionQuestion = {
    id: string;
    checked: boolean;
    ok: boolean | null;
    excused?: boolean;
};

export type ReviewQuizCompletionSummary = {
    checkedCount: number;
    correctCount: number;
    total: number;
    denom: number;
    excusedCount: number;
    score: number;
    allChecked: boolean;
    allCorrect: boolean;
    passed: boolean;
};

export function computeReviewQuizCompletionSummary(args: {
    questions: ReviewQuizCompletionQuestion[];
    /**
     * Kept for compatibility and display logic.
     * Review cards still require all non-excused questions to be correct.
     */
    passScore?: number;
    requireAllCorrect?: boolean;
}): ReviewQuizCompletionSummary {
    const requireAllCorrect = args.requireAllCorrect ?? true;

    let checkedCount = 0;
    let correctCount = 0;
    let denom = 0;
    let excusedCount = 0;

    for (const question of args.questions) {
        if (question.checked || question.excused) {
            checkedCount += 1;
        }

        if (question.excused) {
            excusedCount += 1;
            continue;
        }

        denom += 1;

        if (question.ok === true) {
            correctCount += 1;
        }
    }

    const total = args.questions.length;
    const allChecked = checkedCount >= total && total > 0;
    const allCorrect = denom === 0 ? true : correctCount >= denom;
    const score = denom === 0 ? 1 : correctCount / denom;

    const loosePassed =
        allChecked && (denom === 0 ? true : score >= (args.passScore ?? 1));

    const passed = requireAllCorrect
        ? allChecked && allCorrect
        : loosePassed;

    return {
        checkedCount,
        correctCount,
        total,
        denom,
        excusedCount,
        score,
        allChecked,
        allCorrect,
        passed,
    };
}


export function resolveReviewCardAutoCompletionReason(args: {
    prereqsMet: boolean;
    locked: boolean;
    isCompleted: boolean;
    summary: Pick<ReviewQuizCompletionSummary, "passed">;
    allQuestionsFlowDone: boolean;
    hasFinalizedZeroCreditQuestion: boolean;
    terminalQuestionOk: boolean | null;
    terminalFinalizedActionConsumed: boolean;
}): ReviewAssessmentCompletionReason | null {
    if (!args.prereqsMet) return null;
    if (args.locked) return null;
    if (args.isCompleted) return null;

    // All-correct completion keeps the existing credit/submit path.
    if (args.summary.passed) return "passed";

    /**
     * A project can contain an earlier revealed/finalized step and end with a
     * correct final step. In that case there is no final Reveal button to click,
     * but the assessment is navigation-complete and must be finalized at zero
     * credit. A revealed terminal step still waits for its explicit Finish click;
     * the persisted consumed marker repairs completion after a remount/race.
     */
    if (
        args.allQuestionsFlowDone &&
        args.hasFinalizedZeroCreditQuestion &&
        (args.terminalQuestionOk === true ||
            args.terminalFinalizedActionConsumed)
    ) {
        return "finalized";
    }

    return null;
}

export function shouldAutoCompleteReviewCard(args: {
    prereqsMet: boolean;
    locked: boolean;
    isCompleted: boolean;
    summary: Pick<ReviewQuizCompletionSummary, "passed">;
}): boolean {
    if (!args.prereqsMet) return false;
    if (args.locked) return false;
    if (args.isCompleted) return false;
    return args.summary.passed;
}


export function shouldFinalizeReviewCardFromManualNext(args: {
    prereqsMet: boolean;
    locked: boolean;
    isCompleted: boolean;
    isLast: boolean;
    allQuestionsFlowDone: boolean;
}): boolean {
    if (!args.prereqsMet) return false;
    if (args.locked) return false;
    if (args.isCompleted) return false;
    if (!args.isLast) return false;
    return args.allQuestionsFlowDone;
}

/**
 * Resolves the post-reveal action shown by a practice card.
 *
 * Deliberately do not gate this on the parent card's `isCompleted` prop. That
 * prop can update before the revealed item has rendered its terminal action,
 * especially after a debounced progress save or a restored session. Keeping
 * the action visible prevents a finalized zero-credit item from becoming a
 * disabled dead end. The parent handler remains idempotent.
 */
export function resolveReviewFinalizedPracticeAction(args: {
    action?: ReviewFinalizedPracticeAction | null;
    revealed: boolean;
    correct: boolean;
    unlocked: boolean;
    locked: boolean;
    excused: boolean;
    hasHandler: boolean;
}): ReviewFinalizedPracticeAction | null {
    if (!args.action) return null;
    if (!args.revealed) return null;
    if (args.correct) return null;
    if (!args.unlocked) return null;
    if (args.locked) return null;
    if (args.excused) return null;
    if (!args.hasHandler) return null;

    return args.action;
}

export function isPracticeOutOfAttempts(args: {
    attempts: number;
    maxAttempts?: number | null;
    unlimitedAttempts: boolean;
}): boolean {
    if (args.unlimitedAttempts) return false;
    if (args.maxAttempts == null) return false;

    return args.attempts >= args.maxAttempts;
}