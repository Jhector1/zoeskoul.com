"use client";

import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { normalizeProgressTopics, normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";

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

        for (const x of [tp.topicKey, tp.topicSlug, tp.slug, tp.genKey, tp.topicId, tp.id]) {
            if (x != null) set.add(String(x));
        }
    }

    return set;
}

export function buildReviewProgressPayload(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    state: ReviewProgressState;
    activeTopicId?: string;
}) {
    const { subjectSlug, moduleSlug, locale, state, activeTopicId } = args;

    return {
        subjectSlug,
         moduleSlug, // keep server schema compatibility for now
        locale,
        state: {
            ...normalizeProgressTopics(state),
            ...(activeTopicId ? { activeTopicId: normalizeTopicProgressKey(activeTopicId) } : {}),
        },
    };
}

export async function fetchReviewProgressGET(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    signal?: AbortSignal;
}) {
    const { subjectSlug, moduleSlug, locale, signal } = args;

    const url =
        `/api/review/progress?subjectSlug=${encodeURIComponent(subjectSlug)}` +
        `&moduleSlug=${encodeURIComponent(moduleSlug)}` +
        `&locale=${encodeURIComponent(locale)}`;

    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) return emptyReviewProgress();

    const data = await res.json().catch(() => null);
    return normalizeProgressTopics(
        ((data?.progress ?? null) as ReviewProgressState | null) ?? emptyReviewProgress(),
    );
}
