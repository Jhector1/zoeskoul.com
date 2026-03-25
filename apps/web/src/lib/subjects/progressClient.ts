// src/lib/review/progressClient.ts
"use client";

import type { ReviewProgressState } from "@/lib/subjects/progressTypes";

export function emptyReviewProgress(): ReviewProgressState {
  return {
    topics: {},
    quizVersion: 0,
    moduleCompleted: false,
    moduleCompletedAt: undefined,
  };
}

export function completedTopicKeysFromProgress(p: ReviewProgressState | null | undefined) {
  const set = new Set<string>();
  const topicsObj: any = p?.topics ?? {};

  for (const [k, tp] of Object.entries<any>(topicsObj)) {
    if (!tp?.completed) continue;

    // key itself (most common)
    if (k) set.add(String(k));

    // tolerate alternate shapes if you ever store these
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
