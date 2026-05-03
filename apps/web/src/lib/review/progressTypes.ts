export type SavedQuizState = {
    answers: Record<string, any>;
    checkedById: Record<string, boolean>;

    practiceItemPatch?: Record<string, any>;
    practiceMeta?: Record<
        string,
        { attempts: number; ok: boolean | null }
    >;

    updatedAt?: number;
    excusedById?: Record<string, boolean>;
};

export type ReviewTopicProgress = {
    quizVersion?: number;
    cardsDone?: Record<string, boolean>;
    quizzesDone?: Record<string, boolean>;
    quizState?: Record<string, SavedQuizState>;
    sketchState?: Record<string, any>;
    completed?: boolean;
    completedAt?: string;

    // Phase 7: Integrated Zustand runtime state
    runtimeStateV2?: {
        cards?: Record<string, any>;
        exercises?: Record<string, any>;
    };
};

export type ReviewProgressState = {
    quizVersion?: number;
    moduleCompleted?: boolean;
    moduleCompletedAt?: string;
    activeTopicId?: string;
    assignmentSessionId?: string | null;
    topics?: Record<string, ReviewTopicProgress>;
};