"use client";

import { useEffect, useMemo, useRef, useState, useCallback, type Dispatch, type SetStateAction } from "react";
import type { ReviewProgressState, ReviewTopicProgress } from "@/lib/review/progressTypes";
import {
    emptyReviewProgress,
    fetchReviewProgressGET,
    buildReviewProgressPayload,
    saveReviewProgressPUT,
} from "@zoeskoul/learning-client/legacy-compatible/review/progressClient";
import {
    getReviewProgressClientSaveRevision as getSaveRevision,
    isReviewUserSavedState as isUserSavedState,
    mergeReviewProgressForConflictRetry as mergeProgressStatesForSave,
    normalizeReviewProgressForClientSync as normalizeProgressTopics,
    normalizeTopicProgressKey,
    scopeReviewProgressToTopics,
    isReviewWorkspaceState as isWorkspaceState,
    reviewSavedStateUpdatedAt as numericUpdatedAt,
    withoutReviewProgressSaveRevision as withoutSaveRevision,
    canonicalizeReviewExerciseStateKey as canonicalizeExerciseStateKey,
    getReviewSavedWorkspace as getSavedWorkspace,
    getSavedReviewExerciseCode as getSavedExerciseCode,
    getSavedReviewExerciseLanguage as getSavedExerciseLanguage,
    getSavedReviewExerciseStdin as getSavedExerciseStdin,
    hasSavedReviewExerciseContent as hasSavedExerciseContent,
    hasSavedReviewExerciseEditorContent as hasSavedExerciseEditorContent,
    isScopedReviewExerciseStateKey as isScopedExerciseStateKey,
    looksLikeBetterReviewExerciseRestoreCandidate as looksLikeBetterExerciseRestoreCandidate,
    savedReviewExerciseLooksLikeLearnerEditorWork as savedExerciseLooksLikeLearnerEditorWork,
} from "@zoeskoul/learning-runtime";
import { stableJson } from "@zoeskoul/learning-client/legacy-compatible/client/persistence/stableJson";
import { useFlushOnPageExit } from "@zoeskoul/learning-client/legacy-compatible/client/persistence/useFlushOnPageExit";
import {
    buildCanonicalWorkspaceIdentity,
    nextWorkspaceSaveRevision,
    shouldApplyWorkspaceResponse,
    preserveLocalWorkspaceNavigation,
    savedStarterHashMatchesRuntimeStarter,
    WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS,
    WORKSPACE_RUNTIME_SAVE_COALESCE_MS,
} from "@zoeskoul/learning-runtime/review/workspacePersistenceContract";
import { emitGamificationUpdate } from "@zoeskoul/learning-client/legacy-compatible/gamification/browserEvents";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "@zoeskoul/learning-runtime/review/module/runtime/runtimeProgressBridge";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "@zoeskoul/learning-runtime/review/module/runtime/reviewSaveDebug";
import {
    getCardIdFromToolScopeKey,
    getCardStateKeyFromToolScopeKey,
    getCardToolScopeKey,
    getExerciseStateKey,
} from "@zoeskoul/learning-runtime/review/module/runtime/exerciseKeys";
import { stateLanguageMatches } from "@zoeskoul/learning-runtime/review/module/runtime/workspaceCodeSource";
import {
    canPollReviewRemoteProgress,
    shouldApplyRemoteReviewWorkspace,
    shouldTrackReviewRuntimeMutation,
} from "./reviewProgressRemoteSyncPolicy";

function isPersistedCardToolKey(toolKey: string) {
    if (typeof toolKey !== "string" || !toolKey.trim()) return false;
    if (toolKey.startsWith("exercise:")) return false;
    if (toolKey.startsWith("topic-tool:")) return false;
    return true;
}

type ReviewSaveStatus =
    | "idle"
    | "unsaved"
    | "saving"
    | "saved"
    | "error"
    | "conflict";

type ReviewProgressSetter = Dispatch<SetStateAction<ReviewProgressState>>;

type ReviewProgressPayload = ReturnType<typeof buildReviewProgressPayload>;

export type ReviewNavigationProgressSnapshot = Readonly<{
    moduleIdentity: string;
    cardIdentity: string | null;
    exerciseIdentity: string | null;
    progressRevision: number;
    navigationGeneration: number;
    payload: Readonly<ReviewProgressPayload>;
}>;

export function createReviewNavigationProgressSnapshot(args: {
    subjectSlug: string;
    moduleSlug: string;
    cardIdentity: string | null;
    exerciseIdentity: string | null;
    progressRevision: number;
    navigationGeneration: number;
    payload: ReviewProgressPayload;
}): ReviewNavigationProgressSnapshot {
    const detachedPayload = JSON.parse(stableJson(args.payload)) as ReviewProgressPayload;

    return Object.freeze({
        moduleIdentity: `${args.subjectSlug}:${args.moduleSlug}`,
        cardIdentity: args.cardIdentity,
        exerciseIdentity: args.exerciseIdentity,
        progressRevision: args.progressRevision,
        navigationGeneration: args.navigationGeneration,
        payload: detachedPayload,
    });
}

export function reviewModuleTopicIdsDependencyKey(
    moduleTopicIds: readonly string[],
) {
    return stableJson(Array.from(moduleTopicIds));
}

export function useReviewProgress(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    firstTopicId: string;
    moduleTopicIds: readonly string[];
    endpoint?: string;
    gamificationEnabled?: boolean;
    readOnly?: boolean;
    followRemoteNavigation?: boolean;
    remoteSyncEnabled?: boolean;
}) {
    const {
        subjectSlug,
        moduleSlug,
        locale,
        firstTopicId,
        moduleTopicIds: moduleTopicIdsInput,
        endpoint = "/api/review/progress",
        gamificationEnabled = endpoint === "/api/review/progress",
        readOnly = false,
        followRemoteNavigation = true,
        remoteSyncEnabled = true,
    } = args;

    /**
     * Review progress is scoped by topic values, not by a caller-created array
     * identity. Standalone Practice passes an inline empty list; without this
     * stable owner, a successful GET updates state, re-renders, receives a new
     * [], and restarts hydration indefinitely.
     */
    const moduleTopicIdsKey =
        reviewModuleTopicIdsDependencyKey(moduleTopicIdsInput);
    const stableModuleTopicIdsRef = useRef<{
        key: string;
        value: readonly string[];
    }>({
        key: moduleTopicIdsKey,
        value: Array.from(moduleTopicIdsInput),
    });

    if (stableModuleTopicIdsRef.current.key !== moduleTopicIdsKey) {
        stableModuleTopicIdsRef.current = {
            key: moduleTopicIdsKey,
            value: Array.from(moduleTopicIdsInput),
        };
    }

    const moduleTopicIds = stableModuleTopicIdsRef.current.value;


    const [progress, setProgress] = useState<ReviewProgressState>(
        emptyReviewProgress(),
    );
    const [hydrated, setHydrated] = useState(false);

    const [viewTopicId, setViewTopicId] = useState(firstTopicId);
    const [activeTopicId, _setActiveTopicId] = useState(firstTopicId);

    const progressRef = useRef(progress);
    const activeTopicIdRef = useRef(firstTopicId);
    const saveSeqRef = useRef(0);
    const hydrationCompleteRef = useRef(false);
    const pendingRuntimeHydrationRef = useRef(false);
    const applyingRemoteRef = useRef(false);
    const localDirtyRef = useRef(false);
    const remoteSyncInFlightRef = useRef(false);
    const saveInFlightRef = useRef(false);
    const pendingSavePayloadRef = useRef<any | null>(null);
    const navigationSaveQueueRef = useRef<ReviewNavigationProgressSnapshot[]>([]);
    const pendingSaveTimerRef = useRef<number | null>(null);
    const runtimeSaveTimerRef = useRef<number | null>(null);
    const lastSavedMeaningfulBodyRef = useRef<string>("");
    const lastCommittedRef = useRef<string>("");
    const [saveStatus, setSaveStatus] = useState<ReviewSaveStatus>("idle");
    const [lastSaveError, setLastSaveError] = useState<string | null>(null);

    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    const setActiveTopicId = useCallback((id: string) => {
        activeTopicIdRef.current = id;
        _setActiveTopicId(id);
    }, []);

    const runtimeExerciseContractsKey = useReviewRuntimeStore((state) => {
        if (!pendingRuntimeHydrationRef.current) return "";

        return Object.entries(state.exercises ?? {})
            .map(([key, value]) =>
                [
                    key,
                    String(value?.starterHash ?? ""),
                    String(value?.workspaceStatus ?? ""),
                    String(value?.language ?? value?.lang ?? ""),
                ].join("::"),
            )
            .sort()
            .join("|");
    });

    useEffect(() => {
        useReviewRuntimeStore
            .getState()
            .setTopicIds(activeTopicId, viewTopicId);
    }, [activeTopicId, viewTopicId]);

    const setProgressSafe = useCallback<ReviewProgressSetter>((updater) => {
        setProgress((prev) => {
            const next = typeof updater === "function" ? updater(prev) : updater;
            if (next === prev) {
                progressRef.current = next;
                return next;
            }

            const prevBody = stableJson(withoutSaveRevision(prev));
            const nextBody = stableJson(withoutSaveRevision(next));

            if (prevBody === nextBody) {
                progressRef.current = prev;
                return prev;
            }

            if (hydrationCompleteRef.current && !applyingRemoteRef.current) {
                localDirtyRef.current = true;
            }

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
                moduleTopicIds,
                state: progress,
                activeTopicId: normalizeTopicProgressKey(activeTopicId),
            }),
        [subjectSlug, moduleSlug, locale, moduleTopicIds, progress, activeTopicId],
    );

    function makeSaveState(
        state: ReviewProgressState,
        options?: { runtimeAlreadyMerged?: boolean },
    ): ReviewProgressState {
        const stateWithRuntime = options?.runtimeAlreadyMerged
            ? state
            : mergeRuntimeIntoProgress(
                  state,
                  useReviewRuntimeStore.getState(),
              );

        const scopedStateWithRuntime =
            scopeReviewProgressToTopics(
                stateWithRuntime,
                moduleTopicIds,
            );

        const previousRevision = getSaveRevision(scopedStateWithRuntime);
        const nextRevision = nextWorkspaceSaveRevision({ previousRevision });

        const stateToSave = {
            ...(scopedStateWithRuntime as any),
            __saveRevision: nextRevision,
        } as ReviewProgressState;

        progressRef.current = stateToSave;

        return stateToSave;
    }

    const buildPayloadFromState = useCallback(
        (state: ReviewProgressState) => {
            return buildReviewProgressPayload({
                subjectSlug,
                moduleSlug,
                locale,
                moduleTopicIds,
                state,
                activeTopicId: normalizeTopicProgressKey(activeTopicIdRef.current),
            });
        },
        [subjectSlug, moduleSlug, locale, moduleTopicIds],
    );

    const meaningfulBodyForPayload = useCallback((nextPayload: typeof payload) => {
        return stableJson({
            ...nextPayload,
            state: withoutSaveRevision(nextPayload.state),
        });
    }, []);

    const prime = useCallback(
        (nextPayload: typeof payload) => {
            const body = stableJson(nextPayload);
            lastCommittedRef.current = body;
            lastSavedMeaningfulBodyRef.current = meaningfulBodyForPayload(nextPayload);
            pendingSavePayloadRef.current = null;
            localDirtyRef.current = false;
            setSaveStatus("saved");
            setLastSaveError(null);
        },
        [meaningfulBodyForPayload],
    );

    const cancel = useCallback(() => {
        if (pendingSaveTimerRef.current != null) {
            window.clearTimeout(pendingSaveTimerRef.current);
            pendingSaveTimerRef.current = null;
        }
        pendingSavePayloadRef.current = null;
        navigationSaveQueueRef.current = [];
        if (runtimeSaveTimerRef.current != null) {
            window.clearTimeout(runtimeSaveTimerRef.current);
            runtimeSaveTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!readOnly) return;
        cancel();
        localDirtyRef.current = false;
        setSaveStatus("idle");
        setLastSaveError(null);
    }, [cancel, readOnly]);

    const savePayloadToApi = useCallback(
        async (nextPayload: typeof payload, options?: { keepalive?: boolean; reason?: string }) => {
            if (readOnly) {
                pendingSavePayloadRef.current = null;
                localDirtyRef.current = false;
                setSaveStatus("idle");
                setLastSaveError(null);
                return;
            }
            let payloadToSave = nextPayload;
            let meaningfulBody = meaningfulBodyForPayload(payloadToSave);

            if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
                lastCommittedRef.current = stableJson(payloadToSave);
                localDirtyRef.current = false;
                setSaveStatus("saved");
                setLastSaveError(null);
                return;
            }

            /**
             * Fast path: do not GET the latest progress before every autosave.
             * The server already merges incoming state with the stored row and
             * rejects stale revisions. Fetching before every PUT was competing
             * with first exercise delivery and practice validation. We only pay
             * the extra GET cost on a real 409 conflict below.
             */

            const ac = options?.keepalive ? null : new AbortController();
            const timeout = ac ? window.setTimeout(() => ac.abort(), 15000) : null;

            const putOnce = async (
                requestPayload: typeof payloadToSave,
            ) => {
                return saveReviewProgressPUT({
                    payload: requestPayload,
                    endpoint,
                    keepalive: options?.keepalive === true,
                    signal: ac?.signal,
                });
            };

            let saveResult: Awaited<
                ReturnType<typeof saveReviewProgressPUT>
            >;

            try {
                saveResult = await putOnce(payloadToSave).finally(() => {
                    if (timeout != null) window.clearTimeout(timeout);
                });
            } catch (error: any) {
                if (
                    Number(error?.status ?? 0) !== 409 ||
                    options?.keepalive
                ) {
                    throw error;
                }

                const latestRemote =
                    scopeReviewProgressToTopics(
                        await fetchReviewProgressGET({
                            subjectSlug: payloadToSave.subjectSlug,
                            moduleSlug: payloadToSave.moduleSlug,
                            locale: payloadToSave.locale,
                            endpoint,
                        }),
                        moduleTopicIds,
                    );
                const mergedState = mergeProgressStatesForSave(
                    latestRemote,
                    payloadToSave.state as ReviewProgressState,
                );
                payloadToSave = buildReviewProgressPayload({
                    subjectSlug: payloadToSave.subjectSlug,
                    moduleSlug: payloadToSave.moduleSlug,
                    locale: payloadToSave.locale,
                    moduleTopicIds,
                    state: mergedState,
                    activeTopicId: normalizeTopicProgressKey(
                        (payloadToSave.state as any).activeTopicId ??
                            activeTopicIdRef.current,
                    ),
                }) as typeof payload;
                meaningfulBody =
                    meaningfulBodyForPayload(payloadToSave);
                saveResult = await putOnce(payloadToSave);
            }

            const data = saveResult.data;
            const canonicalState =
                scopeReviewProgressToTopics(
                    saveResult.state,
                    moduleTopicIds,
                );
            const canonicalPayload = buildReviewProgressPayload({
                subjectSlug: payloadToSave.subjectSlug,
                moduleSlug: payloadToSave.moduleSlug,
                locale: payloadToSave.locale,
                moduleTopicIds,
                state: canonicalState,
                activeTopicId: normalizeTopicProgressKey(
                    (canonicalState as any).activeTopicId ?? activeTopicIdRef.current,
                ),
            }) as typeof payload;

            const hasNewerQueuedState =
                navigationSaveQueueRef.current.length > 0 ||
                pendingSavePayloadRef.current !== null ||
                getSaveRevision(progressRef.current) > getSaveRevision(canonicalState);

            if (!hasNewerQueuedState) {
                progressRef.current = canonicalState;
            }
            lastCommittedRef.current = stableJson(canonicalPayload);
            lastSavedMeaningfulBodyRef.current = meaningfulBodyForPayload(canonicalPayload);
            localDirtyRef.current = hasNewerQueuedState;
            setSaveStatus(hasNewerQueuedState ? "saving" : "saved");
            setLastSaveError(null);

            const gamification = gamificationEnabled ? data?.gamification ?? null : null;
            if (gamification?.summary) {
                emitGamificationUpdate({
                    source: "review_progress",
                    xpGained: gamification.xpGained ?? 0,
                    leveledUp: Boolean(gamification.leveledUp),
                    streakExtended: Boolean(gamification.streakExtended),
                    summary: gamification.summary,
                });
            }
        },
        [endpoint, gamificationEnabled, meaningfulBodyForPayload, moduleTopicIds, readOnly],
    );

    const drainSaveQueueRef = useRef<() => Promise<void>>(async () => undefined);

    const drainSaveQueue = useCallback(async () => {
        if (!subjectSlug || !moduleSlug) return;
        if (!hydrationCompleteRef.current) return;
        if (saveInFlightRef.current) return;

        const navigationSnapshot = navigationSaveQueueRef.current.shift() ?? null;
        const nextPayload = navigationSnapshot?.payload ?? pendingSavePayloadRef.current;
        if (!nextPayload) return;

        const meaningfulBody = meaningfulBodyForPayload(nextPayload);
        if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
            if (!navigationSnapshot) pendingSavePayloadRef.current = null;
            const hasMoreQueuedState = Boolean(
                navigationSaveQueueRef.current.length || pendingSavePayloadRef.current,
            );
            localDirtyRef.current = hasMoreQueuedState;
            setSaveStatus(hasMoreQueuedState ? "saving" : "saved");
            setLastSaveError(null);
            if (hasMoreQueuedState) {
                queueMicrotask(() => {
                    void drainSaveQueueRef.current();
                });
            }
            return;
        }

        if (!navigationSnapshot) pendingSavePayloadRef.current = null;
        saveInFlightRef.current = true;
        setLastSaveError(null);

        let failed = false;
        try {
            setSaveStatus("saving");
            await savePayloadToApi(nextPayload);
        } catch (error: any) {
            failed = true;
            const status = Number(error?.status ?? 0);
            setSaveStatus(status === 409 ? "conflict" : "error");
            setLastSaveError(error?.message ?? String(error));
            localDirtyRef.current = true;
            if (navigationSnapshot) {
                navigationSaveQueueRef.current.unshift(navigationSnapshot);
            } else {
                // Preserve the newest known payload. Do not overwrite it with older snapshots.
                pendingSavePayloadRef.current = pendingSavePayloadRef.current ?? nextPayload;
            }
        } finally {
            saveInFlightRef.current = false;
            if (
                !failed &&
                (navigationSaveQueueRef.current.length > 0 || pendingSavePayloadRef.current)
            ) {
                void drainSaveQueueRef.current();
            }
        }
    }, [subjectSlug, moduleSlug, meaningfulBodyForPayload, savePayloadToApi]);

    useEffect(() => {
        drainSaveQueueRef.current = drainSaveQueue;
    }, [drainSaveQueue]);

    const captureNavigationProgressSnapshot = useCallback(
        (identity: {
            cardIdentity: string | null;
            exerciseIdentity: string | null;
            navigationGeneration: number;
        }): ReviewNavigationProgressSnapshot | null => {
            if (!subjectSlug || !moduleSlug) return null;
            if (!hydrationCompleteRef.current || readOnly) return null;

            if (pendingSaveTimerRef.current != null) {
                window.clearTimeout(pendingSaveTimerRef.current);
                pendingSaveTimerRef.current = null;
            }
            if (runtimeSaveTimerRef.current != null) {
                window.clearTimeout(runtimeSaveTimerRef.current);
                runtimeSaveTimerRef.current = null;
            }

            const stateWithRuntime = mergeRuntimeIntoProgress(
                progressRef.current,
                useReviewRuntimeStore.getState(),
            );
            const stateToSave = makeSaveState(stateWithRuntime, {
                runtimeAlreadyMerged: true,
            });
            const nextPayload = buildPayloadFromState(stateToSave);

            progressRef.current = stateToSave;
            pendingSavePayloadRef.current = null;
            localDirtyRef.current = true;

            return createReviewNavigationProgressSnapshot({
                subjectSlug,
                moduleSlug,
                cardIdentity: identity.cardIdentity,
                exerciseIdentity: identity.exerciseIdentity,
                progressRevision: getSaveRevision(stateToSave),
                navigationGeneration: identity.navigationGeneration,
                payload: nextPayload,
            });
        },
        [subjectSlug, moduleSlug, readOnly, buildPayloadFromState],
    );

    const enqueueNavigationProgressSnapshot = useCallback(
        (snapshot: ReviewNavigationProgressSnapshot | null) => {
            if (!snapshot || readOnly) return;
            if (snapshot.moduleIdentity !== `${subjectSlug}:${moduleSlug}`) return;

            navigationSaveQueueRef.current.push(snapshot);
            localDirtyRef.current = true;
            setSaveStatus("saving");

            queueMicrotask(() => {
                void drainSaveQueueRef.current();
            });
        },
        [moduleSlug, readOnly, subjectSlug],
    );

    const queueProgressSave = useCallback(
        (nextState: ReviewProgressState, options?: { immediate?: boolean; reason?: string }) => {
            if (!subjectSlug || !moduleSlug) return;
            if (!hydrationCompleteRef.current) return;
            if (readOnly || applyingRemoteRef.current) {
                pendingSavePayloadRef.current = null;
                localDirtyRef.current = false;
                return;
            }

            const latestRuntime = useReviewRuntimeStore.getState();
            const mergedState = mergeRuntimeIntoProgress(nextState, latestRuntime);
            const meaningfulPayload = buildPayloadFromState(withoutSaveRevision(mergedState) as ReviewProgressState);
            const meaningfulBody = meaningfulBodyForPayload(meaningfulPayload as any);

            if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
                localDirtyRef.current = false;
                return;
            }

            const stateToSave = makeSaveState(mergedState, {
                runtimeAlreadyMerged: true,
            });
            const nextPayload = buildPayloadFromState(stateToSave);

            pendingSavePayloadRef.current = nextPayload as any;
            localDirtyRef.current = true;

            if (pendingSaveTimerRef.current != null) {
                window.clearTimeout(pendingSaveTimerRef.current);
                pendingSaveTimerRef.current = null;
            }

            if (options?.immediate) {
                setSaveStatus("saving");
                void drainSaveQueueRef.current();
                return;
            }

            setSaveStatus("unsaved");
            pendingSaveTimerRef.current = window.setTimeout(() => {
                pendingSaveTimerRef.current = null;
                void drainSaveQueueRef.current();
            }, WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS);
        },
        [subjectSlug, moduleSlug, buildPayloadFromState, meaningfulBodyForPayload, readOnly],
    );
    const sleep = (ms: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, ms));


    const flush = useCallback(async () => {
        if (readOnly) {
            cancel();
            pendingSavePayloadRef.current = null;
            localDirtyRef.current = false;
            return;
        }

        if (pendingSaveTimerRef.current != null) {
            window.clearTimeout(pendingSaveTimerRef.current);
            pendingSaveTimerRef.current = null;
        }

        if (runtimeSaveTimerRef.current != null) {
            window.clearTimeout(runtimeSaveTimerRef.current);
            runtimeSaveTimerRef.current = null;
        }

        if (hydrationCompleteRef.current) {
            const latestProgress = mergeRuntimeIntoProgress(
                progressRef.current,
                useReviewRuntimeStore.getState(),
            );

            progressRef.current = latestProgress;

            queueProgressSave(latestProgress, {
                immediate: true,
                reason: "flush",
            });
        }

        /**
         * Drain the current save and any payload queued while a save was in flight.
         * This makes internal navigation wait for the final edited workspace save,
         * instead of racing against debounce/in-flight saves.
         */
        const startedAt = Date.now();
        const timeoutMs = 15_000;

        while (Date.now() - startedAt < timeoutMs) {
            await drainSaveQueueRef.current();

            if (
                !saveInFlightRef.current &&
                navigationSaveQueueRef.current.length === 0 &&
                !pendingSavePayloadRef.current
            ) {
                return;
            }

            await sleep(50);
        }

        await drainSaveQueueRef.current();
    }, [cancel, queueProgressSave, readOnly]);


    const putProgressNow = useCallback(
        async (
            state: ReviewProgressState,
            options?: {
                keepalive?: boolean;
                reason?: string;
                mergeRuntime?: boolean;
                discardPendingSaves?: boolean;
            },
        ) => {
            if (!subjectSlug || !moduleSlug) return;
            if (!hydrationCompleteRef.current) return;
            if (readOnly) {
                pendingSavePayloadRef.current = null;
                localDirtyRef.current = false;
                return;
            }

            const mergeRuntime = options?.mergeRuntime !== false;
            const stateForSave = mergeRuntime
                ? mergeRuntimeIntoProgress(state, useReviewRuntimeStore.getState())
                : state;

            if (options?.discardPendingSaves) {
                if (pendingSaveTimerRef.current != null) {
                    window.clearTimeout(pendingSaveTimerRef.current);
                    pendingSaveTimerRef.current = null;
                }
                if (runtimeSaveTimerRef.current != null) {
                    window.clearTimeout(runtimeSaveTimerRef.current);
                    runtimeSaveTimerRef.current = null;
                }
                pendingSavePayloadRef.current = null;
            }

            const meaningfulPayload = buildPayloadFromState(withoutSaveRevision(stateForSave) as ReviewProgressState);
            const meaningfulBody = meaningfulBodyForPayload(meaningfulPayload as any);

            if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
                localDirtyRef.current = false;
                setSaveStatus("saved");
                return;
            }

            const saveSeq = ++saveSeqRef.current;
            const stateToSave = makeSaveState(stateForSave, {
                runtimeAlreadyMerged: mergeRuntime,
            });
            const nextPayload = buildPayloadFromState(stateToSave);

            if (options?.keepalive) {
                saveInFlightRef.current = true;
                setSaveStatus("saving");
                try {
                    await savePayloadToApi(nextPayload as any, options);
                    if (saveSeq === saveSeqRef.current) {
                        setProgressSafe(stateToSave);
                    }
                } catch (error: any) {
                    const status = Number(error?.status ?? 0);
                    setSaveStatus(status === 409 ? "conflict" : "error");
                    setLastSaveError(error?.message ?? String(error));
                    pendingSavePayloadRef.current = nextPayload as any;
                    localDirtyRef.current = true;
                } finally {
                    saveInFlightRef.current = false;
                }
                return;
            }

            pendingSavePayloadRef.current = nextPayload as any;
            localDirtyRef.current = true;

            const startedAt = Date.now();
            while (Date.now() - startedAt < 15_000) {
                await drainSaveQueueRef.current();
                if (
                    !saveInFlightRef.current &&
                    !pendingSavePayloadRef.current
                ) {
                    break;
                }
                await sleep(50);
            }

            if (saveSeq === saveSeqRef.current && lastSavedMeaningfulBodyRef.current === meaningfulBody) {
                setProgressSafe(stateToSave);
            }
        },
        [subjectSlug, moduleSlug, buildPayloadFromState, meaningfulBodyForPayload, readOnly, savePayloadToApi, setProgressSafe],
    );

    const hydrateRuntimeFromProgress = useCallback(
        (
            normalizedProgress: ReviewProgressState,
            reason: string,
            runtimeGeneration = useReviewRuntimeStore.getState().resetRevision,
        ) => {
            pendingRuntimeHydrationRef.current = false;
            const topics = (normalizedProgress as any).topics ?? {};
            if (!topics) return;

            const resolveExerciseKey = (rawKey: string, saved: any, tid: string, cardIdHint = "") => {
                const explicit =
                    typeof saved?.exerciseKey === "string" && saved.exerciseKey.trim()
                        ? saved.exerciseKey
                        : typeof saved?.exerciseStateKey === "string" && saved.exerciseStateKey.trim()
                            ? saved.exerciseStateKey
                            : "";

                const candidate = explicit || rawKey;
                const canonicalCandidate = canonicalizeExerciseStateKey(candidate, tid);
                if (isScopedExerciseStateKey(canonicalCandidate)) {
                    return canonicalCandidate;
                }

                const canBuildScopedKey =
                    Boolean(saved?.subjectSlug ?? subjectSlug) &&
                    Boolean(saved?.moduleSlug ?? moduleSlug) &&
                    Boolean(saved?.topicId ?? tid) &&
                    Boolean(saved?.cardId ?? cardIdHint) &&
                    Boolean(
                        saved?.exerciseId ??
                        saved?.stableExerciseId ??
                        saved?.id ??
                        saved?.key ??
                        candidate,
                    );

                if (canBuildScopedKey) {
                    const exerciseId =
                        saved?.exerciseId ??
                        saved?.stableExerciseId ??
                        saved?.id ??
                        saved?.key ??
                        candidate;

                    return getExerciseStateKey(
                        {
                            subjectSlug: saved?.subjectSlug ?? subjectSlug,
                            moduleSlug: saved?.moduleSlug ?? moduleSlug,
                            sectionSlug: saved?.sectionSlug,
                            topicId: normalizeTopicProgressKey(saved?.topicId ?? tid),
                            cardId: saved?.cardId ?? cardIdHint,
                        },
                        String(exerciseId),
                    );
                }

                if (!isScopedExerciseStateKey(candidate)) {
                    return "";
                }

                const existingMatch = Object.entries(
                    useReviewRuntimeStore.getState().exercises ?? {},
                ).find(([key, value]: any) => {
                    const finalSegment = key.split(":").filter(Boolean).slice(5).join(":");
                    return (
                        finalSegment === candidate ||
                        value?.exerciseId === candidate ||
                        value?.exerciseKey === candidate ||
                        String(value?.exerciseKey ?? "").endsWith(`:${candidate}`)
                    );
                });

                if (existingMatch?.[0]) return existingMatch[0];

                const exerciseId =
                    saved?.exerciseId ??
                    saved?.stableExerciseId ??
                    saved?.id ??
                    saved?.key ??
                    candidate;

                return getExerciseStateKey(
                    {
                        subjectSlug: saved?.subjectSlug ?? subjectSlug,
                        moduleSlug: saved?.moduleSlug ?? moduleSlug,
                        sectionSlug: saved?.sectionSlug,
                        topicId: normalizeTopicProgressKey(saved?.topicId ?? tid),
                        cardId: saved?.cardId ?? cardIdHint,
                    },
                    String(exerciseId),
                );
            };

            const hydrateExercise = (args: {
                source: string;
                rawKey: string;
                saved: any;
                topicId: string;
                cardIdHint?: string;
            }) => {
                const { source, rawKey, saved, topicId, cardIdHint = "" } = args;
                if (!hasSavedExerciseContent(saved)) return;

                const canonicalExerciseKey = resolveExerciseKey(rawKey, saved, topicId, cardIdHint);
                if (!canonicalExerciseKey) return;

                const runtimeNow = useReviewRuntimeStore.getState();
                const existingExercise = runtimeNow.exercises[canonicalExerciseKey] ?? null;
                const parts = canonicalExerciseKey.split(":");
                const savedWorkspace = getSavedWorkspace(saved);
                const savedHasEditorContent = hasSavedExerciseEditorContent(saved);

                /**
                 * Never restore saved editor/workspace content before the real
                 * current exercise contract exists in runtime.
                 *
                 * For authored project steps, that contract is the compiled
                 * manifest. For generated practice items, it is the live
                 * /api/practice item registered by the rendered card. DB/local
                 * progress may hydrate learner work only after one of those
                 * authored sources has registered this exact exercise key.
                 */
                if (!existingExercise) {
                    pendingRuntimeHydrationRef.current = true;
                    return;
                }

                const savedMatchesCurrentStarter = savedStarterHashMatchesRuntimeStarter({
                    saved,
                    existingStarterHash: existingExercise?.starterHash,
                    existingWorkspace:
                        existingExercise?.workspace ??
                        existingExercise?.codeWorkspace ??
                        existingExercise?.ideWorkspace,
                });

                const savedMatchesExistingLanguage =
                    !existingExercise?.language ||
                    stateLanguageMatches(
                        saved,
                        existingExercise.language,
                        savedWorkspace,
                    );

                const savedLooksLikeLearnerEditorWork =
                    savedMatchesExistingLanguage &&
                    savedExerciseLooksLikeLearnerEditorWork(saved, savedWorkspace);

                /**
                 * Important:
                 * If the curriculum starter changed, drop passive starter snapshots,
                 * but never drop real learner-owned editor/workspace content. Dropping
                 * user/saved work here is what makes saved code fall back to starter.
                 */
                const shouldDropSavedWorkspace =
                    !savedLooksLikeLearnerEditorWork &&
                    !savedMatchesCurrentStarter &&
                    Boolean(existingExercise?.starterHash);

                const shouldHydrateEditorState =
                    savedHasEditorContent &&
                    !shouldDropSavedWorkspace &&
                    savedMatchesExistingLanguage;

                const existingWorkspace =
                    existingExercise?.workspace ??
                    existingExercise?.codeWorkspace ??
                    existingExercise?.ideWorkspace ??
                    null;
                const hydratedWorkspace = !shouldHydrateEditorState
                    ? existingWorkspace
                    : savedWorkspace;
                const workspace =
                    !followRemoteNavigation && reason !== "initial"
                        ? preserveLocalWorkspaceNavigation(
                            hydratedWorkspace,
                            existingWorkspace,
                        )
                        : hydratedWorkspace;

                const code = !shouldHydrateEditorState
                    ? existingExercise?.code ?? existingExercise?.source ?? undefined
                    : getSavedExerciseCode(saved, savedWorkspace);

                const stdin = !shouldHydrateEditorState
                    ? existingExercise?.stdin ?? existingExercise?.codeStdin ?? ""
                    : getSavedExerciseStdin(saved, savedWorkspace);

                const language = !shouldHydrateEditorState
                    ? existingExercise?.language ?? existingExercise?.lang ?? "python"
                    : getSavedExerciseLanguage(
                        saved,
                        savedWorkspace,
                        existingExercise?.language ?? "python",
                    );

                const userEdited = !shouldHydrateEditorState
                    ? existingExercise?.userEdited ?? false
                    : isUserSavedState(saved) ||
                    (Boolean(savedWorkspace) &&
                        saved?.workspaceOrigin !== "starter" &&
                        saved?.workspaceOrigin !== "empty" &&
                        saved?.userEdited !== false);

                const workspaceOrigin = !shouldHydrateEditorState
                    ? existingExercise?.workspaceOrigin ?? "starter"
                    : saved?.workspaceOrigin ??
                    (userEdited ? "saved" : Boolean(savedWorkspace) ? "starter" : undefined);

                const explicitRemoteWorkspaceApply =
                    reason !== "initial" && reason !== "runtime-contract-ready";
                const incomingExercise = {
                    ...saved,
                    exerciseKey: canonicalExerciseKey,
                    workspaceApplyRevision: explicitRemoteWorkspaceApply
                        ? Math.max(
                            Number(existingExercise?.workspaceApplyRevision ?? 0),
                            Number(saved?.workspaceApplyRevision ?? 0),
                          ) + 1
                        : saved?.workspaceApplyRevision ??
                          existingExercise?.workspaceApplyRevision,
                    subjectSlug:
                        saved?.subjectSlug ??
                        existingExercise?.subjectSlug ??
                        parts[0] ??
                        subjectSlug,
                    moduleSlug:
                        saved?.moduleSlug ??
                        existingExercise?.moduleSlug ??
                        parts[1] ??
                        moduleSlug,
                    sectionSlug:
                        saved?.sectionSlug ??
                        existingExercise?.sectionSlug ??
                        parts[2] ??
                        undefined,
                    topicId: normalizeTopicProgressKey(
                        saved?.topicId ?? existingExercise?.topicId ?? parts[3] ?? topicId,
                    ),
                    cardId:
                        saved?.cardId ??
                        existingExercise?.cardId ??
                        parts[4] ??
                        cardIdHint ??
                        "",
                    exerciseId:
                        saved?.exerciseId ??
                        existingExercise?.exerciseId ??
                        parts.slice(5).join(":"),
                    language,
                    lang: saved?.lang ?? saved?.language ?? language,
                    workspace,
                    codeWorkspace: workspace,
                    ideWorkspace: workspace,
                    code,
                    source: code,
                    stdin,
                    codeStdin: stdin,
                    workspaceStatus: "ready" as const,
                    userEdited,
                    workspaceOrigin,
                    starterHash: saved?.starterHash ?? existingExercise?.starterHash,
                    updatedAt: saved?.updatedAt ?? Date.now(),
                };

                if (!shouldApplyRemoteReviewWorkspace({
                    readOnly,
                    reason,
                    looksLikeBetterCandidate: looksLikeBetterExerciseRestoreCandidate(
                        existingExercise,
                        incomingExercise,
                    ),
                })) {
                    return;
                }

                reviewSaveDebug("hydrate exercise from DB", {
                    reason,
                    source,
                    rawKey,
                    canonicalExerciseKey,
                    topicId,
                    cardIdHint,
                    userEdited: incomingExercise.userEdited,
                    workspaceOrigin: incomingExercise.workspaceOrigin,
                    savedHasEditorContent,
                    workspaceDroppedBecauseStarterChanged: shouldDropSavedWorkspace,
                    workspace: summarizeWorkspaceForSave(workspace),
                });

                const runtimeApi = useReviewRuntimeStore.getState();
                const incomingExerciseGeneration =
                    isWorkspaceState((incomingExercise as any)?.workspace) ||
                    isWorkspaceState((incomingExercise as any)?.codeWorkspace) ||
                    isWorkspaceState((incomingExercise as any)?.ideWorkspace)
                        ? runtimeGeneration
                        : undefined;
                runtimeApi.ensureExercise({
                    exerciseKey: canonicalExerciseKey,
                    subjectSlug: incomingExercise.subjectSlug,
                    moduleSlug: incomingExercise.moduleSlug,
                    sectionSlug: incomingExercise.sectionSlug,
                    topicId: incomingExercise.topicId,
                    cardId: incomingExercise.cardId,
                    manifest: incomingExercise as any,
                    saved: incomingExercise as any,
                });
                runtimeApi.patchExercise(canonicalExerciseKey, {
                    ...(incomingExercise as any),
                    ...(typeof incomingExerciseGeneration === "number"
                        ? {
                            generation: incomingExerciseGeneration,
                            updateOrigin: "review-progress-hydrate",
                            workspaceMutation: {
                                generation: incomingExerciseGeneration,
                                source: "review-progress-hydrate",
                                mutation: "hydrate",
                            },
                        }
                        : {}),
                } as any);
            };

            Object.entries(topics).forEach(([tidRaw, tp]: any) => {
                const tid = normalizeTopicProgressKey(tidRaw);

                if (tp.toolState) {
                    Object.entries(tp.toolState).forEach(([toolKey, toolEntry]) => {
                        const key = String(toolKey);
                        const entry = toolEntry as any;
                        const workspace = getSavedWorkspace(entry);
                        if (!workspace) return;
                        if (entry?.starterHash) {
                            const runtimeNow = useReviewRuntimeStore.getState();
                            const existingExercise =
                                key.startsWith("exercise:")
                                    ? runtimeNow.exercises[key.replace(/^exercise:/, "")]
                                    : null;

                            if (
                                existingExercise?.starterHash &&
                                entry.starterHash !== existingExercise.starterHash
                            ) {
                                return;
                            }
                        }
                        if (key.startsWith("exercise:")) {
                            hydrateExercise({
                                source: "toolState",
                                rawKey: key.replace(/^exercise:/, ""),
                                saved: entry,
                                topicId: tid,
                                cardIdHint: entry?.cardId ?? "",
                            });
                            return;
                        }

                        if (!isPersistedCardToolKey(key)) return;

                        const cardId = getCardIdFromToolScopeKey(key);
                        const cardKey = getCardStateKeyFromToolScopeKey(key);
                        const canonicalToolKey = getCardToolScopeKey(cardKey);
                        const userEdited = isUserSavedState(entry);

                        reviewSaveDebug("hydrate toolState from DB", {
                            reason,
                            persistedToolKey: key,
                            hydratedCardKey: cardKey,
                            topicId: tid,
                            cardId,
                            userEdited,
                            workspaceOrigin: entry.workspaceOrigin,
                            workspace: summarizeWorkspaceForSave(workspace),
                        });

                        const runtimeApi = useReviewRuntimeStore.getState();
                        runtimeApi.ensureCard({
                            cardKey,
                            topicId: tid,
                            cardId,
                            toolKey: canonicalToolKey,
                            initial: {
                                cardKey,
                                topicId: tid,
                                cardId,
                                visited: false,
                                completed: false,
                                toolKey: key,
                                toolWorkspace: workspace,
                                toolCode: entry.code,
                                toolStdin: entry.stdin,
                                toolLang: entry.lang,
                                userEdited,
                                workspaceOrigin:
                                    entry.workspaceOrigin ??
                                    (userEdited ? "saved" : "starter"),
                                starterHash: entry.starterHash,
                                updatedAt: entry.updatedAt ?? Date.now(),
                            } as any,
                        });

                        runtimeApi.patchCard(cardKey, {
                            topicId: tid,
                            cardId,
                            toolKey: canonicalToolKey,
                            toolWorkspace: workspace,
                            toolCode: entry.code,
                            toolStdin: entry.stdin,
                            toolLang: entry.lang,
                            userEdited,
                            workspaceOrigin:
                                entry.workspaceOrigin ??
                                (userEdited ? "saved" : "starter"),
                            starterHash: entry.starterHash,
                        } as any);
                    });
                }

                if (tp.runtimeStateV2?.cards) {
                    Object.entries(tp.runtimeStateV2.cards).forEach(([ckey, cstate]) => {
                        const savedCard = cstate as any;
                        const userEdited = isUserSavedState(savedCard);

                        reviewSaveDebug("hydrate card from DB", {
                            reason,
                            cardKey: ckey,
                            topicId: tid,
                            cardId: savedCard.cardId || "",
                            userEdited,
                            workspaceOrigin: savedCard.workspaceOrigin,
                            toolKey: savedCard.toolKey,
                            toolWorkspace: summarizeWorkspaceForSave(savedCard.toolWorkspace),
                        });

                        useReviewRuntimeStore.getState().ensureCard({
                            cardKey: ckey,
                            topicId: tid,
                            cardId: savedCard.cardId || "",
                            toolKey: getCardToolScopeKey(ckey),
                            initial: {
                                ...savedCard,
                                userEdited,
                                workspaceOrigin:
                                    savedCard.workspaceOrigin ??
                                    (userEdited ? "saved" : "starter"),
                            },
                        });
                    });
                }

                if (tp.runtimeStateV2?.exercises) {
                    Object.entries(tp.runtimeStateV2.exercises).forEach(([ekey, estate]) => {
                        hydrateExercise({
                            source: "runtimeStateV2.exercises",
                            rawKey: String(ekey),
                            saved: estate,
                            topicId: tid,
                            cardIdHint: (estate as any)?.cardId ?? "",
                        });
                    });
                }

                if (tp.quizState) {
                    Object.entries(tp.quizState).forEach(([cardId, cardState]: any) => {
                        Object.entries(cardState?.practiceItemPatch ?? {}).forEach(
                            ([patchKey, patch]) => {
                                hydrateExercise({
                                    source: "quizState.practiceItemPatch",
                                    rawKey: String(patchKey),
                                    saved: patch,
                                    topicId: tid,
                                    cardIdHint: String(cardId),
                                });
                            },
                        );
                    });
                }
            });
        },
        [firstTopicId, followRemoteNavigation, moduleSlug, readOnly, subjectSlug],
    );

    useEffect(() => {
        if (!hydrated) return;
        if (!pendingRuntimeHydrationRef.current) return;

        applyingRemoteRef.current = true;
        try {
            hydrateRuntimeFromProgress(
                progressRef.current,
                "runtime-contract-ready",
                useReviewRuntimeStore.getState().resetRevision,
            );
        } finally {
            applyingRemoteRef.current = false;
        }
    }, [hydrated, hydrateRuntimeFromProgress, runtimeExerciseContractsKey]);

    useEffect(() => {
        if (!subjectSlug || !moduleSlug) return;

        const ctrl = new AbortController();

        hydrationCompleteRef.current = false;
        setHydrated(false);

        if (!remoteSyncEnabled) {
            const ep = emptyReviewProgress();

            applyingRemoteRef.current = true;
            try {
                cancel();
                progressRef.current = ep;
                setProgressSafe(ep);
                setActiveTopicId(firstTopicId);
                setViewTopicId(firstTopicId);
                pendingRuntimeHydrationRef.current = false;
                localDirtyRef.current = false;
                setSaveStatus("idle");
                setLastSaveError(null);
            } finally {
                applyingRemoteRef.current = false;
                hydrationCompleteRef.current = true;
                setHydrated(true);
            }

            return;
        }

        (async () => {
            try {
                const startedGeneration = useReviewRuntimeStore.getState().resetRevision;
                const fetchedProgress = await fetchReviewProgressGET({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    signal: ctrl.signal,
                    endpoint,
                });
                if (ctrl.signal.aborted) return;
                if (useReviewRuntimeStore.getState().resetRevision !== startedGeneration) {
                    return;
                }

                const normalizedProgress =
                    scopeReviewProgressToTopics(
                        normalizeProgressTopics(fetchedProgress),
                        moduleTopicIds,
                    );

                setProgressSafe(normalizedProgress);
                hydrateRuntimeFromProgress(normalizedProgress, "initial", startedGeneration);

                const nextActive = normalizeTopicProgressKey(
                    (normalizedProgress as any).activeTopicId || firstTopicId,
                );

                setActiveTopicId(nextActive);
                setViewTopicId(nextActive);

                const hydratedPayload = buildReviewProgressPayload({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    moduleTopicIds,
                    state: normalizedProgress,
                    activeTopicId: nextActive,
                });
                prime(hydratedPayload);
                localDirtyRef.current = false;
            } catch (error: any) {
                if (ctrl.signal.aborted || error?.name === "AbortError") return;
                const ep = emptyReviewProgress();

                setProgressSafe(ep);
                setActiveTopicId(firstTopicId);
                setViewTopicId(firstTopicId);

                const emptyPayload = buildReviewProgressPayload({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    moduleTopicIds,
                    state: ep,
                    activeTopicId: normalizeTopicProgressKey(firstTopicId),
                });
                prime(emptyPayload);
                localDirtyRef.current = false;
            } finally {
                if (ctrl.signal.aborted) return;
                hydrationCompleteRef.current = true;
                setHydrated(true);
            }
        })();

        return () => ctrl.abort();
    }, [
        subjectSlug,
        moduleSlug,
        moduleTopicIds,
        locale,
        endpoint,
        firstTopicId,
        setProgressSafe,
        setActiveTopicId,
        prime,
        hydrateRuntimeFromProgress,
        cancel,
        remoteSyncEnabled,
    ]);

    const syncRemoteProgress = useCallback(
        async (reason: string, signal?: AbortSignal) => {
            if (!remoteSyncEnabled) return;
            if (!subjectSlug || !moduleSlug) return;
            if (!hydrated || !hydrationCompleteRef.current) return;
            if (typeof document !== "undefined" && document.visibilityState !== "visible") {
                return;
            }
            if (remoteSyncInFlightRef.current) return;
            if (saveInFlightRef.current) return;

            remoteSyncInFlightRef.current = true;

            try {
                if (!readOnly && localDirtyRef.current) {
                    await flush();
                }

                if (readOnly) {
                    // Read-only tutor/reference/learner views must never become
                    // locally dirty just because Monaco or the runtime store
                    // mounted. Otherwise the dirty guard permanently blocks the
                    // next tutor workspace poll.
                    cancel();
                    pendingSavePayloadRef.current = null;
                    localDirtyRef.current = false;
                }

                if (!canPollReviewRemoteProgress({
                    readOnly,
                    localDirty: localDirtyRef.current,
                    remoteSyncInFlight: false,
                    saveInFlight: saveInFlightRef.current,
                    hasPendingSave: Boolean(pendingSavePayloadRef.current),
                })) {
                    return;
                }

                const startedGeneration = useReviewRuntimeStore.getState().resetRevision;
                const remoteProgress =
                    scopeReviewProgressToTopics(
                        normalizeProgressTopics(
                            await fetchReviewProgressGET({
                                subjectSlug,
                                moduleSlug,
                                locale,
                                signal,
                                endpoint,
                            }),
                        ),
                        moduleTopicIds,
                    );
                if (signal?.aborted) return;
                if (useReviewRuntimeStore.getState().resetRevision !== startedGeneration) {
                    return;
                }

                const remoteRevision = getSaveRevision(remoteProgress);
                const localRevision = getSaveRevision(progressRef.current);
                const remotePayload = buildReviewProgressPayload({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    moduleTopicIds,
                    state: remoteProgress,
                    activeTopicId: normalizeTopicProgressKey(
                        (remoteProgress as any).activeTopicId || activeTopicIdRef.current || firstTopicId,
                    ),
                });
                const remoteMeaningfulBody = meaningfulBodyForPayload(remotePayload as typeof payload);
                const localPayload = buildReviewProgressPayload({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    moduleTopicIds,
                    state: progressRef.current,
                    activeTopicId: normalizeTopicProgressKey(
                        (progressRef.current as any).activeTopicId || activeTopicIdRef.current || firstTopicId,
                    ),
                });
                const localMeaningfulBody = meaningfulBodyForPayload(localPayload as typeof payload);

                const requestIdentity = buildCanonicalWorkspaceIdentity({
                    endpoint,
                    subjectSlug,
                    moduleSlug,
                    locale,
                });
                if (!shouldApplyWorkspaceResponse({
                    expectedIdentity: requestIdentity,
                    responseIdentity: requestIdentity,
                    requestAborted: signal?.aborted === true,
                    currentRevision: localRevision,
                    responseRevision: remoteRevision,
                    sameContent: remoteMeaningfulBody === localMeaningfulBody,
                })) {
                    return;
                }

                applyingRemoteRef.current = true;
                cancel();

                hydrateRuntimeFromProgress(remoteProgress, reason, startedGeneration);

                const nextActive = normalizeTopicProgressKey(
                    (remoteProgress as any).activeTopicId || activeTopicIdRef.current || firstTopicId,
                );

                progressRef.current = remoteProgress;
                setProgressSafe(remoteProgress);
                if (followRemoteNavigation) {
                    setActiveTopicId(nextActive);
                    setViewTopicId(nextActive);
                }
                localDirtyRef.current = false;

                const canonicalRemotePayload = buildReviewProgressPayload({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    moduleTopicIds,
                    state: remoteProgress,
                    activeTopicId: nextActive,
                });
                prime(canonicalRemotePayload);

            } catch (error: any) {
                if (signal?.aborted || error?.name === "AbortError") return;
                console.warn("[review-progress] remote sync failed", {
                    reason,
                    message: error?.message ?? String(error),
                });
            } finally {
                applyingRemoteRef.current = false;
                remoteSyncInFlightRef.current = false;
            }
        },
        [
            subjectSlug,
            moduleSlug,
            moduleTopicIds,
            locale,
            endpoint,
            hydrated,
            flush,
            cancel,
            hydrateRuntimeFromProgress,
            firstTopicId,
            followRemoteNavigation,
            setProgressSafe,
            setActiveTopicId,
            meaningfulBodyForPayload,
            prime,
            readOnly,
            remoteSyncEnabled,
        ],
    );

    useEffect(() => {
        if (!remoteSyncEnabled) return;
        if (!subjectSlug || !moduleSlug) return;
        if (!hydrated || !hydrationCompleteRef.current) return;
        if (typeof document === "undefined") return;

        const ctrl = new AbortController();

        const poll = (reason: string) => {
            void syncRemoteProgress(reason, ctrl.signal);
        };

        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            // Controlled live sync: only pull remote changes when this tab has
            // no unsaved local work and no save/sync is in flight. That lets a
            // second computer's newer DB save appear automatically without
            // racing against active editing in the current tab.
            if (!canPollReviewRemoteProgress({
                readOnly,
                localDirty: localDirtyRef.current,
                remoteSyncInFlight: remoteSyncInFlightRef.current,
                saveInFlight: saveInFlightRef.current,
                hasPendingSave: Boolean(pendingSavePayloadRef.current),
            })) return;
            poll("poll");
        }, 4000);

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                poll("visible");
            }
        };

        const onFocus = () => poll("focus");
        const onOnline = () => poll("online");

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("focus", onFocus);
        window.addEventListener("online", onOnline);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("online", onOnline);
            ctrl.abort();
        };
    }, [subjectSlug, moduleSlug, hydrated, readOnly, remoteSyncEnabled, syncRemoteProgress]);

    useEffect(() => {
        if (!hydrated || !hydrationCompleteRef.current) return;
        if (readOnly || applyingRemoteRef.current) return;
        if (!localDirtyRef.current) return;

        queueProgressSave(progressRef.current, { reason: "progress-change" });
    }, [payload, hydrated, queueProgressSave, readOnly]);

    useEffect(() => {
        if (!hydrated || readOnly || typeof window === "undefined") return;

        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!localDirtyRef.current && !saveInFlightRef.current && !pendingSavePayloadRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [hydrated, readOnly]);

    useFlushOnPageExit(() => {
        if (!hydrated || readOnly || !hydrationCompleteRef.current) return;

        cancel();

        const latestProgress = mergeRuntimeIntoProgress(
            progressRef.current,
            useReviewRuntimeStore.getState(),
        );

        progressRef.current = latestProgress;

        void putProgressNow(latestProgress, {
            reason: "page-exit",
            // A normal fetch may be cancelled by refresh/navigation. The Code
            // pane capture listener has already flushed pending editor state into
            // the runtime, so keep this final DB write alive during page teardown.
            keepalive: true,
        });
    }, hydrated && !readOnly);

    useEffect(() => {
        if (!hydrated || readOnly || !hydrationCompleteRef.current) return;

        return () => {
            cancel();

            const latestProgress = mergeRuntimeIntoProgress(
                progressRef.current,
                useReviewRuntimeStore.getState(),
            );

            progressRef.current = latestProgress;

            void putProgressNow(latestProgress, {
                reason: "cleanup",
                keepalive: false,
            });
        };
    }, [hydrated, readOnly, subjectSlug, moduleSlug, locale, cancel, putProgressNow]);

    useEffect(() => {
        if (!hydrated || !hydrationCompleteRef.current) return;

        const unsub = useReviewRuntimeStore.subscribe((runtimeState) => {
            if (!hydrationCompleteRef.current) return;
            if (!shouldTrackReviewRuntimeMutation({
                readOnly,
                applyingRemote: applyingRemoteRef.current,
            })) return;

            localDirtyRef.current = true;

            // Runtime/editor updates can fire many times while Monaco is booting or
            // while the user is typing. Avoid doing large stableJson/DB-save work
            // on every store tick; coalesce it so buttons stay clickable.
            if (runtimeSaveTimerRef.current != null) {
                window.clearTimeout(runtimeSaveTimerRef.current);
            }

            runtimeSaveTimerRef.current = window.setTimeout(() => {
                runtimeSaveTimerRef.current = null;
                if (!hydrationCompleteRef.current || applyingRemoteRef.current) return;

                const latestRuntime = useReviewRuntimeStore.getState();
                const next = mergeRuntimeIntoProgress(progressRef.current, latestRuntime);
                if (next === progressRef.current) return;

                progressRef.current = next;
                queueProgressSave(next, {
                    immediate: true,
                    reason: "runtime-store",
                });
            }, WORKSPACE_RUNTIME_SAVE_COALESCE_MS);
        });

        return () => {
            unsub();
            if (runtimeSaveTimerRef.current != null) {
                window.clearTimeout(runtimeSaveTimerRef.current);
                runtimeSaveTimerRef.current = null;
            }
        };
    }, [hydrated, queueProgressSave, readOnly]);

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
        captureNavigationProgressSnapshot,
        enqueueNavigationProgressSnapshot,
        saveStatus,
        lastSaveError,
    };
}
