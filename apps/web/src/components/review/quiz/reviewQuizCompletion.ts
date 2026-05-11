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

export function isPracticeOutOfAttempts(args: {
    attempts: number;
    maxAttempts?: number | null;
    unlimitedAttempts: boolean;
}): boolean {
    if (args.unlimitedAttempts) return false;
    if (args.maxAttempts == null) return false;

    return args.attempts >= args.maxAttempts;
}