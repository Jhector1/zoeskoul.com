"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReviewProgressState } from "@/lib/review/progressTypes";
import {
  emptyReviewProgress,
  fetchReviewProgressGET,
  buildReviewProgressPayload,
} from "@/lib/review/progressClient";
import { stableJson } from "@/lib/client/persistence/stableJson";
import { useDebouncedCommit } from "@/lib/client/persistence/useDebouncedCommit";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";

export function useReviewProgress(args: {
  subjectSlug: string;
  moduleId: string;
  locale: string;
  firstTopicId: string;
}) {
  const { subjectSlug, moduleId, locale, firstTopicId } = args;

  const [progress, setProgress] = useState<ReviewProgressState>(emptyReviewProgress());
  const [hydrated, setHydrated] = useState(false);

  const [viewTopicId, setViewTopicId] = useState(firstTopicId);
  const [activeTopicId, _setActiveTopicId] = useState(firstTopicId);

  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const activeTopicIdRef = useRef(firstTopicId);

  const setActiveTopicId = useCallback((id: string) => {
    activeTopicIdRef.current = id;
    _setActiveTopicId(id);
  }, []);

  const setProgressSafe = useCallback((updater: any) => {
    setProgress((prev: any) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      progressRef.current = next;
      return next;
    });
  }, []);

  const payload = useMemo(
      () =>
          buildReviewProgressPayload({
            subjectSlug,
            moduleId,
            locale,
            state: progress,
            activeTopicId,
          }),
      [subjectSlug, moduleId, locale, progress, activeTopicId],
  );

    const commitProgress = useCallback(
        async (_payload: typeof payload, body: string, signal: AbortSignal) => {
            try {
                const res = await fetch("/api/review/progress", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body,
                    cache: "no-store",
                    signal,
                });

                if (!res.ok) {
                    throw new Error(`Progress save failed: ${res.status}`);
                }
            } catch (e: any) {
                if (signal.aborted) return;
                if (e?.name === "AbortError") return;
                throw e;
            }
        },
        [],
    );

  const {
    prime,
    flush,
    cancel,
    lastCommittedRef,
  } = useDebouncedCommit({
    value: payload,
    enabled: hydrated && Boolean(subjectSlug && moduleId),
    delayMs: 900,
    serialize: stableJson,
    commit: commitProgress,
  });

    const putProgressNow = useCallback(
        async (state: ReviewProgressState) => {
            if (!subjectSlug || !moduleId) return;

            const nextPayload = buildReviewProgressPayload({
                subjectSlug,
                moduleId,
                locale,
                state,
                activeTopicId: activeTopicIdRef.current,
            });

            const body = stableJson(nextPayload);

            if (body === lastCommittedRef.current) return;

            if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
                try {
                    if (body.length < 60000) {
                        const blob = new Blob([body], { type: "application/json" });
                        const ok = (navigator as any).sendBeacon("/api/review/progress", blob);
                        if (ok) {
                            lastCommittedRef.current = body;
                            return;
                        }
                    }
                } catch {}
            }

            try {
                const res = await fetch("/api/review/progress", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body,
                    keepalive: true,
                    cache: "no-store",
                });

                if (res.ok) {
                    lastCommittedRef.current = body;
                }
            } catch {
                // ignore here if you want, but do not mark committed
            }
        },
        [subjectSlug, moduleId, locale, lastCommittedRef],
    );

  useEffect(() => {
    if (!subjectSlug || !moduleId) return;

    const ctrl = new AbortController();
    setHydrated(false);

    (async () => {
      try {
        const p = await fetchReviewProgressGET({
          subjectSlug,
          moduleId,
          locale,
          signal: ctrl.signal,
        });

        setProgressSafe(p);

        const nextActive = (p as any).activeTopicId || firstTopicId;
        setActiveTopicId(nextActive);
        setViewTopicId(nextActive);

        prime(
            buildReviewProgressPayload({
              subjectSlug,
              moduleId,
              locale,
              state: p,
              activeTopicId: nextActive,
            }),
        );
      } catch {
        const ep = emptyReviewProgress();

        setProgressSafe(ep);
        setActiveTopicId(firstTopicId);
        setViewTopicId(firstTopicId);

        prime(
            buildReviewProgressPayload({
              subjectSlug,
              moduleId,
              locale,
              state: ep,
              activeTopicId: firstTopicId,
            }),
        );
      } finally {
        setHydrated(true);
      }
    })();

    return () => ctrl.abort();
  }, [
    subjectSlug,
    moduleId,
    locale,
    firstTopicId,
    setProgressSafe,
    setActiveTopicId,
    prime,
  ]);

  useFlushOnPageExit(() => {
    cancel();
    void putProgressNow(progressRef.current);
  }, hydrated);

  return {
    hydrated,

    progress,
    setProgress: setProgressSafe,

    activeTopicId,
    setActiveTopicId,

    viewTopicId,
    setViewTopicId,

    flushNow: putProgressNow,
    flush,
  };
}