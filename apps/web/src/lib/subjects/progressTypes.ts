export type SavedQuizState = {
    answers: Record<string, any>;
    checkedById: Record<string, boolean>;

    // practice questions: store only patches (no keys/secrets)
    practiceItemPatch?: Record<string /* questionId */, any>;
    practiceMeta?: Record<
        string /* questionId */,
        { attempts: number; ok: boolean | null }
    >;

    updatedAt?: number;
    excusedById?: Record<string /* questionId */, boolean>;
};

export type ReviewTopicProgress = {
    quizVersion?: number;

    /**
     * Legacy reading completion keyed by old card ids.
     * Keep this for backward compatibility while old saved states migrate forward.
     */
    cardsDone?: Record<string, boolean>;

    /**
     * New durable reading completion keyed by semantic reading units.
     * Example:
     *   comments_intro:reading
     *   variables_intro:reading
     */
    readingDone?: Record<string, boolean>;

    /**
     * Quiz/project completion stays keyed by the quiz/project card id.
     */
    quizzesDone?: Record<string, boolean>;

    quizState?: Record<string, SavedQuizState>;

    sketchState?: Record<string, any>;
    toolState?: Record<string, any>;

    completed?: boolean;
    completedAt?: string;
};

export type ReviewProgressState = {
    quizVersion?: number;
    moduleCompleted?: boolean;
    moduleCompletedAt?: string;
    activeTopicId?: string;
    assignmentSessionId?: string | null;

    topics?: Record<string, ReviewTopicProgress>;
};