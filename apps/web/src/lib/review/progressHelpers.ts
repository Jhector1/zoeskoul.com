import type { ReviewProgressState } from "@/lib/review/progressTypes";

export function emptyReviewProgress(): ReviewProgressState {
    return {
        topics: {},
        quizVersion: 0,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
    };
}

export function completedTopicKeysFromProgress(
    p: ReviewProgressState | null | undefined,
) {
    const set = new Set<string>();
    const topicsObj: any = p?.topics ?? {};

    for (const [k, tp] of Object.entries<any>(topicsObj)) {
        if (!tp?.completed) continue;

        if (k) set.add(String(k));

        const extras = [
            tp.topicKey,
            tp.topicSlug,
            tp.slug,
            tp.genKey,
            tp.topicId,
            tp.id,
        ];

        for (const x of extras) {
            if (x != null) set.add(String(x));
        }
    }

    return set;
}

export function buildReviewProgressPayload(args: {
    subjectSlug: string;
    moduleId: string;
    locale: string;
    state: ReviewProgressState;
    activeTopicId: string;
}) {
    const { subjectSlug, moduleId, locale, state, activeTopicId } = args;

    return {
        subjectSlug,
        moduleId,
        locale,
        state: {
            ...state,
            activeTopicId,
        },
    };
}