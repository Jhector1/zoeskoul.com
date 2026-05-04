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
import {emitGamificationUpdate} from "@/lib/gamification/browserEvents";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../runtime/runtimeProgressBridge";
import { reviewDebug, summarizePracticePatch, summarizeWorkspace } from "../runtime/reviewDebug";

export function useReviewProgress(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    firstTopicId: string;
}) {
    const { subjectSlug, moduleSlug, locale, firstTopicId } = args;
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

  const store = useReviewRuntimeStore();

  useEffect(() => {
    store.setTopicIds(activeTopicId, viewTopicId);
  }, [activeTopicId, viewTopicId]); // eslint-disable-line react-hooks/exhaustive-deps

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
              moduleSlug,
              locale,
              state: progress,
              activeTopicId,
          }),
      [subjectSlug, moduleSlug, locale, progress, activeTopicId],
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

                const data = await res.json().catch(() => null);
                const gamification = data?.gamification ?? null;

                if (gamification?.summary) {
                    emitGamificationUpdate({
                        source: "review_progress",
                        xpGained: gamification.xpGained ?? 0,
                        leveledUp: Boolean(gamification.leveledUp),
                        streakExtended: Boolean(gamification.streakExtended),
                        summary: gamification.summary,
                    });
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
    enabled: hydrated && Boolean(subjectSlug && moduleSlug),
    delayMs: 900,
    serialize: stableJson,
    commit: commitProgress,
  });

    const putProgressNow = useCallback(
        async (state: ReviewProgressState) => {
            if (!subjectSlug || !moduleSlug) return;

            const stateWithRuntime = mergeRuntimeIntoProgress(
                state,
                useReviewRuntimeStore.getState(),
            );

            progressRef.current = stateWithRuntime;

            const activeTopic = activeTopicIdRef.current
              ? (stateWithRuntime as any).topics?.[activeTopicIdRef.current]
              : null;

            reviewDebug("9_API_SAVE useReviewProgress.putProgressNow", {
              subjectSlug,
              moduleSlug,
              activeTopicId: activeTopicIdRef.current,
              topicKeys: Object.keys((stateWithRuntime as any).topics ?? {}),
              activeTopicRuntimeExerciseKeys: Object.keys(
                activeTopic?.runtimeStateV2?.exercises ?? {},
              ),
              activeTopicQuizCards: Object.keys(activeTopic?.quizState ?? {}),
              activeTopicPracticePatchByCard: Object.fromEntries(
                Object.entries(activeTopic?.quizState ?? {}).map(([cardId, cardState]: any) => [
                  cardId,
                  Object.fromEntries(
                    Object.entries(cardState?.practiceItemPatch ?? {}).map(
                      ([key, patch]: any) => [key, summarizePracticePatch(patch)],
                    ),
                  ),
                ]),
              ),
            });

            const nextPayload = buildReviewProgressPayload({
                subjectSlug,
                moduleSlug,
                locale,
                state: stateWithRuntime,
                activeTopicId: activeTopicIdRef.current,
            });

            const body = stableJson(nextPayload);




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

                    const data = await res.json().catch(() => null);
                    const gamification = data?.gamification ?? null;

                    if (gamification?.summary) {
                        emitGamificationUpdate({
                            source: "review_progress",
                            xpGained: gamification.xpGained ?? 0,
                            leveledUp: Boolean(gamification.leveledUp),
                            streakExtended: Boolean(gamification.streakExtended),
                            summary: gamification.summary,
                        });
                    }
                }
            } catch {
                // ignore here if you want, but do not mark committed
            }
        },
        [subjectSlug, moduleSlug, locale, lastCommittedRef],
    );

  useEffect(() => {
    if (!subjectSlug || !moduleSlug) return;

    const ctrl = new AbortController();
    setHydrated(false);

    (async () => {
      try {
        const p = await fetchReviewProgressGET({
          subjectSlug,
            moduleSlug,
          locale,
          signal: ctrl.signal,
        });

        const getBody = JSON.stringify(p);


        setProgressSafe(p);

        // Phase 7: Hydrate Zustand store from progress
        if (p.topics) {
            Object.entries(p.topics).forEach(([tid, tp]) => {
                if (tp.runtimeStateV2) {
                    if (tp.runtimeStateV2.cards) {
                        Object.entries(tp.runtimeStateV2.cards).forEach(([ckey, cstate]) => {
                            store.ensureCard({
                                cardKey: ckey,
                                topicId: tid,
                                cardId: (cstate as any).cardId || "",
                                initial: cstate as any,
                            });
                        });
                    }
                    if (tp.runtimeStateV2.exercises) {
                        Object.entries(tp.runtimeStateV2.exercises).forEach(([ekey, estate]) => {
                            const est = estate as any;
                            store.ensureExercise({
                                exerciseKey: ekey,
                                subjectSlug: est.subjectSlug || subjectSlug || "",
                                moduleSlug: est.moduleSlug || moduleSlug || "",
                                sectionSlug: est.sectionSlug,
                                topicId: est.topicId || tid,
                                cardId: est.cardId || "",
                                manifest: estate as any,
                                saved: estate,
                            });
                            // Force immediate patch if saved state has more recent data
                            if (est.workspace || est.code || est.sketch) {
                                store.patchExercise(ekey, est);
                            }
                        });
                    }
                }
            });
        }

        const nextActive = (p as any).activeTopicId || firstTopicId;
        setActiveTopicId(nextActive);
        setViewTopicId(nextActive);

        prime(
            buildReviewProgressPayload({
              subjectSlug,
                moduleSlug,
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
                moduleSlug,
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
      moduleSlug,
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

  useEffect(() => {
    if (!hydrated) return;

    return () => {
      cancel();
      void putProgressNow(progressRef.current);
    };
  }, [hydrated, subjectSlug, moduleSlug, locale, cancel, putProgressNow]);

  // Bridge Zustand runtime changes into persisted review progress.
  // This keeps per-exercise workspaces from falling back to starter code
  // when the user navigates away and returns.
  useEffect(() => {
    if (!hydrated) return;

    const unsub = useReviewRuntimeStore.subscribe((runtimeState) => {
      setProgressSafe((prev: ReviewProgressState) =>
        mergeRuntimeIntoProgress(prev, runtimeState),
      );
    });

    return () => unsub();
  }, [hydrated, setProgressSafe]);
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
