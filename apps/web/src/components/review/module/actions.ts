import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";
import {
    isQuizLikeCard,
    markCardDoneInTopicState,
    normalizeTopicProgressForCards,
} from "./progressKeys";

export function buildNormalizedTopicsProgress(
    topics: ReviewModule["topics"] | undefined,
    progress: ReviewProgressState | null | undefined,
) {
    const safeTopics = Array.isArray(topics) ? topics : [];
    const currentTopics = progress?.topics ?? {};
    const nextTopics: Record<string, any> = { ...currentTopics };
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
    progress: any,
    nowIso: string,
): ReviewProgressState {
    return {
        ...(progress as any),
        moduleCompleted: true,
        moduleCompletedAt: nowIso,
    };
}

export function buildTopicCompletedProgress(
    progress: any,
    viewTid: string,
    nowIso: string,
) {
    const cur = progress?.topics?.[viewTid] ?? {};
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
    progress: any,
    firstTopicId: string,
): ReviewProgressState {
    const nextModuleV = ((progress as any)?.quizVersion ?? 0) + 1;

    return {
        quizVersion: nextModuleV,
        topics: {},
        activeTopicId: firstTopicId as any,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
    } as any;
}
function dropRuntimeForQuizCard(topicState: any, quizCardId: string) {
    const runtime = topicState?.runtimeStateV2;
    if (!runtime) return topicState;

    const nextExercises = Object.fromEntries(
        Object.entries(runtime.exercises ?? {}).filter(([, value]) => {
            return String((value as any)?.cardId ?? "") !== quizCardId;
        }),
    );

    const nextCards = Object.fromEntries(
        Object.entries(runtime.cards ?? {}).filter(([, value]) => {
            return String((value as any)?.cardId ?? "") !== quizCardId;
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

export function buildResetTopicProgress(progress: any, tid: string) {
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
    };

    return {
        ...progress,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
        topics: nextTopics,
    };
}
export function buildMarkCardDoneProgress(
    progress: any,
    viewTid: string,
    card: ReviewCard,
) {
    const tp0: any = progress?.topics?.[viewTid] ?? {};
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
    progress: any,
    viewTid: string,
    quizId: string,
    topicCards: readonly ReviewCard[] = [],
) {
    let nextTopic: any = progress?.topics?.[viewTid] ?? {};

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

export function buildQuizStateProgress(
    progress: any,
    viewTid: string,
    quizCardId: string,
    state: any,
) {
    const tp0: any = progress?.topics?.[viewTid] ?? {};
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
    progress: any,
    viewTid: string,
    quizCardId: string,
) {
    const tp0: any = progress?.topics?.[viewTid] ?? {};
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