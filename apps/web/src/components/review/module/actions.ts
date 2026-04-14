import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type { ReviewProgressState } from "@/lib/subjects/progressTypes";
import {
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
        completed: false,
        completedAt: undefined,
    };

    return {
        ...progress,
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
) {
    const tp0: any = progress?.topics?.[viewTid] ?? {};
    const quizzesDone = { ...(tp0.quizzesDone ?? {}), [quizId]: true };

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: { ...tp0, quizzesDone },
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

    return {
        ...progress,
        topics: {
            ...(progress?.topics ?? {}),
            [viewTid]: {
                ...tp0,
                quizState: nextQuizState,
                quizzesDone: nextQuizzesDone,
            },
        },
    };
}