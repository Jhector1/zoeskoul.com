import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type {
    ReviewProgressState,
    ReviewTopicProgress,
    SavedQuizState,
} from "@/lib/subjects/progressTypes";
import {
    isQuizLikeCard,
    markCardDoneInTopicState,
    normalizeTopicProgressForCards,
} from "./progressKeys";

type RuntimeStateRecord = {
    exercises?: Record<string, { cardId?: string }>;
    cards?: Record<string, { cardId?: string }>;
};
type ExtendedTopicProgress = ReviewTopicProgress & {
    runtimeStateV2?: RuntimeStateRecord;
    toolState?: Record<string, unknown>;
    sketchState?: Record<string, unknown>;
};

function getTopicProgress(
    progress: ReviewProgressState | null | undefined,
    topicId: string,
): ExtendedTopicProgress {
    return (progress?.topics?.[topicId] ?? {}) as ExtendedTopicProgress;
}

export function buildNormalizedTopicsProgress(
    topics: ReviewModule["topics"] | undefined,
    progress: ReviewProgressState | null | undefined,
) {
    const safeTopics = Array.isArray(topics) ? topics : [];
    const currentTopics = progress?.topics ?? {};
    const nextTopics: Record<string, ReviewTopicProgress> = { ...currentTopics };
    let changed = false;

    for (const topic of safeTopics) {
        const cards = Array.isArray(topic.cards) ? topic.cards : [];
        const cur = currentTopics[topic.id] ?? {};
        const normalized = normalizeTopicProgressForCards(cur, cards);
        if (normalized !== cur) {
            nextTopics[topic.id] = normalized;
            changed = true;
        }
    }

    return { changed, nextTopics };
}

export function buildModuleCompletedProgress(
    progress: ReviewProgressState,
    nowIso: string,
): ReviewProgressState {
    return {
        ...progress,
        moduleCompleted: true,
        moduleCompletedAt: nowIso,
    };
}

export function buildTopicCompletedProgress(
    progress: ReviewProgressState,
    viewTid: string,
    nowIso: string,
) {
    const cur = getTopicProgress(progress, viewTid);
    if (cur.completed) return progress;

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: {
                ...cur,
                completed: true,
                completedAt: cur.completedAt ?? nowIso,
            },
        },
    };
}

export function buildResetModuleProgress(
    progress: ReviewProgressState,
    firstTopicId: string,
): ReviewProgressState {
    const nextModuleV = (progress?.quizVersion ?? 0) + 1;

    return {
        quizVersion: nextModuleV,
        topics: {},
        activeTopicId: firstTopicId,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
    };
}
function dropRuntimeForQuizCard(
    topicState: ExtendedTopicProgress,
    quizCardId: string,
) {
    const runtime = topicState?.runtimeStateV2;
    if (!runtime) return topicState;
    const runtimeRecord = runtime as RuntimeStateRecord;

    const nextExercises = Object.fromEntries(
        Object.entries(runtimeRecord.exercises ?? {}).filter(([, value]) => {
            return String(value?.cardId ?? "") !== quizCardId;
        }),
    );

    const nextCards = Object.fromEntries(
        Object.entries(runtimeRecord.cards ?? {}).filter(([, value]) => {
            return String(value?.cardId ?? "") !== quizCardId;
        }),
    );

    return {
        ...topicState,
        runtimeStateV2: {
            ...runtime,
            exercises: nextExercises,
            cards: nextCards,
        },
    };
}

export function buildResetTopicProgress(progress: ReviewProgressState, tid: string) {
    const nextTopics = { ...(progress?.topics ?? {}) };
    const cur = nextTopics[tid] ?? {};
    const nextTopicV = (cur.quizVersion ?? 0) + 1;

    nextTopics[tid] = {
        quizVersion: nextTopicV,
        cardsDone: {},
        readingDone: {},
        quizzesDone: {},
        quizState: {},
        sketchState: {},
        toolState: {},
        runtimeStateV2: {
            exercises: {},
            cards: {},
        },
        completed: false,
        completedAt: undefined,
    } as ExtendedTopicProgress;

    return {
        ...progress,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
        topics: nextTopics,
    };
}
export function buildMarkCardDoneProgress(
    progress: ReviewProgressState,
    viewTid: string,
    card: ReviewCard,
) {
    const tp0 = getTopicProgress(progress, viewTid);
    const nextTopic = markCardDoneInTopicState(tp0, card);

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: nextTopic,
        },
    };
}

export function buildQuizPassProgress(
    progress: ReviewProgressState,
    viewTid: string,
    quizId: string,
    topicCards: readonly ReviewCard[] = [],
) {
    let nextTopic = getTopicProgress(progress, viewTid);

    /**
     * Passing a quiz means the learner has completed the active assessment
     * for this topic. Any non-quiz reading/sketch cards in the same topic
     * should not keep the topic locked forever, especially after refresh,
     * direct navigation, or auto-advance.
     *
     * Quiz/project cards still complete only through their own pass handlers.
     */
    for (const card of topicCards) {
        if (!isQuizLikeCard(card)) {
            nextTopic = markCardDoneInTopicState(nextTopic, card);
        }
    }

    nextTopic = {
        ...nextTopic,
        quizzesDone: {
            ...(nextTopic.quizzesDone ?? {}),
            [quizId]: true,
        },
    };

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: nextTopic,
        },
    };
}

export function buildEmbeddedTryItPassProgress(
    progress: ReviewProgressState,
    viewTid: string,
    tryItId: string,
) {
    const tp0 = getTopicProgress(progress, viewTid);

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: {
                ...tp0,
                quizzesDone: {
                    ...(tp0.quizzesDone ?? {}),
                    [tryItId]: true,
                },
            },
        },
    };
}

export function buildQuizStateProgress(
    progress: ReviewProgressState,
    viewTid: string,
    quizCardId: string,
    state: SavedQuizState,
) {
    const tp0 = getTopicProgress(progress, viewTid);
    const quizState = { ...(tp0.quizState ?? {}), [quizCardId]: state };

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: { ...tp0, quizState },
        },
    };
}

export function buildQuizResetProgress(
    progress: ReviewProgressState,
    viewTid: string,
    quizCardId: string,
) {
    const tp0 = getTopicProgress(progress, viewTid);
    const nextQuizState = { ...(tp0.quizState ?? {}) };
    delete nextQuizState[quizCardId];

    const nextQuizzesDone = { ...(tp0.quizzesDone ?? {}) };
    delete nextQuizzesDone[quizCardId];

    const nextTopic = dropRuntimeForQuizCard(
        {
            ...tp0,
            quizVersion: (tp0.quizVersion ?? 0) + 1,
            quizState: nextQuizState,
            quizzesDone: nextQuizzesDone,
            completed: false,
            completedAt: undefined,
        },
        quizCardId,
    );

    return {
        ...progress,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: nextTopic,
        },
    };
}
