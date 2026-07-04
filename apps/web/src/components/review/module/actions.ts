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

export type QuizResetTarget = {
    progressId: string;
    runtimeCardId?: string;
    cardProgressKeys?: string[];
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
function cardIdFromRuntimeKey(key: string) {
    const parts = String(key ?? "").split(":").filter(Boolean);
    return parts[4] ?? "";
}

function runtimeRecordMatchesCard(
    key: string,
    value: { cardId?: string } | undefined,
    runtimeCardId: string,
) {
    const cardId = String(runtimeCardId ?? "").trim();
    if (!cardId) return false;

    return (
        String(value?.cardId ?? "").trim() === cardId ||
        cardIdFromRuntimeKey(key) === cardId
    );
}

function dropRuntimeForQuizCard(
    topicState: ExtendedTopicProgress,
    runtimeCardId: string,
) {
    const runtime = topicState?.runtimeStateV2;
    if (!runtime) return topicState;
    const runtimeRecord = runtime as RuntimeStateRecord;

    const nextExercises = Object.fromEntries(
        Object.entries(runtimeRecord.exercises ?? {}).filter(([key, value]) => {
            return !runtimeRecordMatchesCard(key, value, runtimeCardId);
        }),
    );

    const nextCards = Object.fromEntries(
        Object.entries(runtimeRecord.cards ?? {}).filter(([key, value]) => {
            return !runtimeRecordMatchesCard(key, value, runtimeCardId);
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

function dropTopicStateForCard(
    topicState: ExtendedTopicProgress,
    runtimeCardId: string,
) {
    const nextSketchState = Object.fromEntries(
        Object.entries(topicState.sketchState ?? {}).filter(([key]) => key !== runtimeCardId),
    );

    const nextToolState = Object.fromEntries(
        Object.entries(topicState.toolState ?? {}).filter(([key]) => {
            if (key === runtimeCardId) return false;
            if (key === `card:${runtimeCardId}`) return false;
            if (key.endsWith(`:${runtimeCardId}:general`)) return false;
            if (key.endsWith(`:${runtimeCardId}`)) return false;
            return true;
        }),
    );

    return {
        ...topicState,
        sketchState: nextSketchState,
        toolState: nextToolState,
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
    target: string | QuizResetTarget,
) {
    const normalizedTarget: QuizResetTarget =
        typeof target === "string"
            ? {
                  progressId: target,
                  runtimeCardId: target,
                  cardProgressKeys: [target],
              }
            : {
                  progressId: target.progressId,
                  runtimeCardId: target.runtimeCardId ?? target.progressId,
                  cardProgressKeys:
                      target.cardProgressKeys && target.cardProgressKeys.length > 0
                          ? target.cardProgressKeys
                          : [target.runtimeCardId ?? target.progressId],
              };
    const tp0 = getTopicProgress(progress, viewTid);
    const nextQuizState = { ...(tp0.quizState ?? {}) };
    delete nextQuizState[normalizedTarget.progressId];

    const nextQuizzesDone = { ...(tp0.quizzesDone ?? {}) };
    delete nextQuizzesDone[normalizedTarget.progressId];

    const nextReadingDone = { ...(tp0.readingDone ?? {}) };
    const nextCardsDone = { ...(tp0.cardsDone ?? {}) };

    for (const key of normalizedTarget.cardProgressKeys ?? []) {
        delete nextReadingDone[key];
        delete nextCardsDone[key];
    }

    const nextTopicBase = dropRuntimeForQuizCard(
        {
            ...tp0,
            quizVersion: (tp0.quizVersion ?? 0) + 1,
            readingDone: nextReadingDone,
            cardsDone: nextCardsDone,
            quizState: nextQuizState,
            quizzesDone: nextQuizzesDone,
            completed: false,
            completedAt: undefined,
        },
        normalizedTarget.runtimeCardId ?? normalizedTarget.progressId,
    );
    const nextTopic = dropTopicStateForCard(
        nextTopicBase,
        normalizedTarget.runtimeCardId ?? normalizedTarget.progressId,
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
