"use client";

import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { emptyReviewProgress } from "@/lib/review/progressHelpers";

export { emptyReviewProgress } from "@/lib/review/progressHelpers";
export {
    completedTopicKeysFromProgress,
    buildReviewProgressPayload,
} from "@/lib/review/progressHelpers";

export async function fetchReviewProgressGET(args: {
    subjectSlug: string;
    moduleId: string;
    locale: string;
    signal?: AbortSignal;
}) {
    const { subjectSlug, moduleId, locale, signal } = args;

    const url =
        `/api/review/progress?subjectSlug=${encodeURIComponent(subjectSlug)}` +
        `&moduleId=${encodeURIComponent(moduleId)}` +
        `&locale=${encodeURIComponent(locale)}`;

    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) return emptyReviewProgress();

    const data = await res.json().catch(() => null);
    const p = (data?.progress ?? null) as ReviewProgressState | null;

    return p ?? emptyReviewProgress();
}