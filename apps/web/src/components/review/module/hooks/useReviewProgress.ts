"use client";

import { useEffect, useMemo, useRef, useState, useCallback, type Dispatch, type SetStateAction } from "react";
import type { ReviewProgressState, ReviewTopicProgress } from "@/lib/review/progressTypes";
import {
    emptyReviewProgress,
    fetchReviewProgressGET,
    buildReviewProgressPayload,
    saveReviewProgressPUT,
} from "@/lib/review/progressClient";
import {
    getReviewProgressClientSaveRevision as getSaveRevision,
    isReviewUserSavedState as isUserSavedState,
    mergeReviewProgressForConflictRetry as mergeProgressStatesForSave,
    normalizeReviewProgressForClientSync as normalizeProgressTopics,
    normalizeTopicProgressKey,
    reviewSavedStateUpdatedAt as numericUpdatedAt,
    withoutReviewProgressSaveRevision as withoutSaveRevision,
} from "@zoeskoul/learning-runtime";
import { stableJson } from "@/lib/client/persistence/stableJson";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";
import {
    buildCanonicalWorkspaceIdentity,
    nextWorkspaceSaveRevision,
    shouldApplyWorkspaceResponse,
    preserveLocalWorkspaceNavigation,
    savedStarterHashMatchesRuntimeStarter,
    workspaceContentHash,
    WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS,
    WORKSPACE_RUNTIME_SAVE_COALESCE_MS,
} from "@/lib/review/workspacePersistenceContract";
import { emitGamificationUpdate } from "@/lib/gamification/browserEvents";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../runtime/runtimeProgressBridge";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "../runtime/reviewSaveDebug";
import {
    getCardIdFromToolScopeKey,
    getCardStateKeyFromToolScopeKey,
    getCardToolScopeKey,
    getExerciseStateKey,
} from "../runtime/exerciseKeys";
import { deriveEntryCode } from "../runtime/exerciseWorkspaceResolver";
import { stateLanguageMatches } from "../runtime/workspaceCodeSource";
import { isUsableStarterCode } from "../runtime/starterContent";
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

function canonicalizeExerciseStateKey(
    exerciseKey: string | null | undefined,
    fallbackTopicId?: string | null,
) {
    const raw = String(exerciseKey ?? "").trim();
    if (!raw) return "";

    const parts = raw.split(":").filter(Boolean);
    if (parts.length < 6) return raw;

    const [subjectSlug, moduleSlug, sectionSlug, topicId, cardId, ...exerciseIdParts] = parts;
    if (!exerciseIdParts.length) return raw;

    return getExerciseStateKey(
        {
            subjectSlug,
            moduleSlug,
            sectionSlug,
            topicId: normalizeTopicProgressKey(fallbackTopicId ?? topicId),
            cardId,
        },
        exerciseIdParts.join(":"),
    );
}

function isScopedExerciseStateKey(value: string | null | undefined) {
    const raw = String(value ?? "").trim();
    if (!raw) return false;
    return raw.split(":").filter(Boolean).length >= 6;
}

function summarizeSavedWorkspaceFiles(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return { fileCount: 0, contentLength: 0 };
    }

    const files = workspace.nodes.filter((node: any) => node?.kind === "file");
    return {
        fileCount: files.length,
        contentLength: files.reduce(
            (sum: number, node: any) => sum + String(node?.content ?? "").length,
            0,
        ),
    };
}

function isWorkspaceState(value: any) {
    return Boolean(value && value.version === 2 && Array.isArray(value.nodes));
}

function getSavedWorkspace(value: any) {
    if (isWorkspaceState(value?.workspace)) return value.workspace;
    if (isWorkspaceState(value?.codeWorkspace)) return value.codeWorkspace;
    if (isWorkspaceState(value?.ideWorkspace)) return value.ideWorkspace;
    if (isWorkspaceState(value?.toolWorkspace)) return value.toolWorkspace;
    return null;
}

function workspaceHasNonBlankCode(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    const code = deriveEntryCode(workspace);
    return isUsableStarterCode(code);
}

function hasUsableSavedCode(value: unknown) {
    return isUsableStarterCode(value);
}

function hasSavedExerciseContent(value: any) {
    const workspace = getSavedWorkspace(value);

    const hasNonBlankCode =
        workspaceHasNonBlankCode(workspace) ||
        hasUsableSavedCode(value?.code) ||
        hasUsableSavedCode(value?.source);

    const hasSketch = Boolean(value?.sketch);

    /**
     * Progress-only state must still hydrate.
     * This preserves checked/correct/submitted/completed progress even when
     * stale editor code is intentionally dropped because the starter changed.
     */
    const hasProgressState =
        value?.checked === true ||
        value?.correct === true ||
        value?.submitted === true ||
        value?.completed === true ||
        typeof value?.attempts === "number" ||
        typeof value?.score === "number" ||
        typeof value?.selectedChoice === "string" ||
        Array.isArray(value?.selectedChoices) ||
        Array.isArray(value?.orderedIds) ||
        typeof value?.blankValue === "string" ||
        typeof value?.answer === "string";

    return Boolean(hasNonBlankCode || hasSketch || hasProgressState);
}

function hasSavedExerciseEditorContent(value: any) {
    const workspace = getSavedWorkspace(value);

    return Boolean(
        workspaceHasNonBlankCode(workspace) ||
        hasUsableSavedCode(value?.code) ||
        hasUsableSavedCode(value?.source),
    );
}

function savedExerciseLooksLikeLearnerEditorWork(value: any, workspace: any) {
    if (!hasSavedExerciseEditorContent(value)) return false;

    /**
     * User/saved owned work is allowed to survive starter regeneration. A
     * starter hash mismatch means the authored starter changed; it should not
     * erase a learner's saved answer.
     */
    if (isUserSavedState(value)) return true;

    /**
     * Passive starter snapshots are runtime bookkeeping, not learner work.
     */
    if (
        value?.workspaceOrigin === "starter" ||
        value?.workspaceOrigin === "empty" ||
        value?.userEdited === false
    ) {
        return false;
    }

    /**
     * Legacy saves may be missing userEdited/workspaceOrigin. If they carry a
     * starterHash and the saved workspace content differs from that hash, treat
     * it as edited learner work. If it matches, it is just an old starter.
     */
    const savedStarterHash =
        typeof value?.starterHash === "string" ? value.starterHash : "";
    if (workspace && savedStarterHash) {
        return workspaceContentHash(workspace) !== savedStarterHash;
    }

    return Boolean(workspace);
}

function getSavedExerciseCode(value: any, workspace: any) {
    const workspaceCode = deriveEntryCode(workspace) ?? "";
    if (isUsableStarterCode(workspaceCode)) return workspaceCode;
    if (isUsableStarterCode(value?.code)) return value.code;
    if (isUsableStarterCode(value?.source)) return value.source;
    return "";
}

function getSavedExerciseStdin(value: any, workspace: any) {
    if (typeof workspace?.stdin === "string") return workspace.stdin;
    if (typeof value?.codeStdin === "string") return value.codeStdin;
    if (typeof value?.stdin === "string") return value.stdin;
    return "";
}

function getSavedExerciseLanguage(value: any, workspace: any, fallback = "python") {
    if (typeof workspace?.language === "string") return workspace.language;
    if (typeof value?.codeLang === "string") return value.codeLang;
    if (typeof value?.lang === "string") return value.lang;
    if (typeof value?.language === "string") return value.language;
    return fallback;
}

function looksLikeBetterExerciseRestoreCandidate(existing: any, incoming: any) {
    if (!incoming) return false;
    if (!existing) return true;

    const existingUser = isUserSavedState(existing);
    const incomingUser = isUserSavedState(incoming);
    if (incomingUser !== existingUser) {
        return incomingUser;
    }

    const existingSummary = summarizeSavedWorkspaceFiles(
        existing.workspace ?? existing.codeWorkspace ?? existing.ideWorkspace ?? null,
    );
    const incomingSummary = summarizeSavedWorkspaceFiles(
        incoming.workspace ?? incoming.codeWorkspace ?? incoming.ideWorkspace ?? null,
    );

    if (incomingSummary.fileCount !== existingSummary.fileCount) {
        return incomingSummary.fileCount > existingSummary.fileCount;
    }

    if (incomingSummary.contentLength !== existingSummary.contentLength) {
        return incomingSummary.contentLength > existingSummary.contentLength;
    }

    return numericUpdatedAt(incoming) >= numericUpdatedAt(existing);
}

type ReviewSaveStatus =
    | "idle"
    | "unsaved"
    | "saving"
    | "saved"
    | "error"
    | "conflict";

type ReviewProgressSetter = Dispatch<SetStateAction<ReviewProgressState>>;

export function useReviewProgress(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    firstTopicId: string;
    endpoint?: string;
    gamificationEnabled?: boolean;
    readOnly?: boolean;
    followRemoteNavigation?: boolean;
}) {
    const {
        subjectSlug,
        moduleSlug,
        locale,
        firstTopicId,
        endpoint = "/api/review/progress",
        gamificationEnabled = endpoint === "/api/review/progress",
        readOnly = false,
        followRemoteNavigation = true,
    } = args;

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

    const store = useReviewRuntimeStore();
    const runtimeExerciseContractsKey = useReviewRuntimeStore((state) =>
        Object.entries(state.exercises ?? {})
            .map(([key, value]) =>
                [
                    key,
                    String(value?.starterHash ?? ""),
                    String(value?.workspaceStatus ?? ""),
                    String(value?.language ?? value?.lang ?? ""),
                ].join("::"),
            )
            .sort()
            .join("|"),
    );

    useEffect(() => {
        store.setTopicIds(activeTopicId, viewTopicId);
    }, [activeTopicId, viewTopicId]); // eslint-disable-line react-hooks/exhaustive-deps

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
                state: progress,
                activeTopicId: normalizeTopicProgressKey(activeTopicId),
            }),
        [subjectSlug, moduleSlug, locale, progress, activeTopicId],
    );

    function makeSaveState(state: ReviewProgressState): ReviewProgressState {
        const latestRuntime = useReviewRuntimeStore.getState();
        const stateWithRuntime = mergeRuntimeIntoProgress(state, latestRuntime);

        const previousRevision = getSaveRevision(stateWithRuntime);
        const nextRevision = nextWorkspaceSaveRevision({ previousRevision });

        const stateToSave = {
            ...(stateWithRuntime as any),
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
                state,
                activeTopicId: normalizeTopicProgressKey(activeTopicIdRef.current),
            });
        },
        [subjectSlug, moduleSlug, locale],
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
            let body = stableJson(payloadToSave);
            let meaningfulBody = meaningfulBodyForPayload(payloadToSave);

            if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
                lastCommittedRef.current = body;
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

                const latestRemote = await fetchReviewProgressGET({
                    subjectSlug: payloadToSave.subjectSlug,
                    moduleSlug: payloadToSave.moduleSlug,
                    locale: payloadToSave.locale,
                    endpoint,
                });
                const mergedState = mergeProgressStatesForSave(
                    latestRemote,
                    payloadToSave.state as ReviewProgressState,
                );
                payloadToSave = buildReviewProgressPayload({
                    subjectSlug: payloadToSave.subjectSlug,
                    moduleSlug: payloadToSave.moduleSlug,
                    locale: payloadToSave.locale,
                    state: mergedState,
                    activeTopicId: normalizeTopicProgressKey(
                        (payloadToSave.state as any).activeTopicId ??
                            activeTopicIdRef.current,
                    ),
                }) as typeof payload;
                body = stableJson(payloadToSave);
                meaningfulBody =
                    meaningfulBodyForPayload(payloadToSave);
                saveResult = await putOnce(payloadToSave);
            }

            const data = saveResult.data;
            const canonicalState = saveResult.state;
            const canonicalPayload = buildReviewProgressPayload({
                subjectSlug: payloadToSave.subjectSlug,
                moduleSlug: payloadToSave.moduleSlug,
                locale: payloadToSave.locale,
                state: canonicalState,
                activeTopicId: normalizeTopicProgressKey(
                    (canonicalState as any).activeTopicId ?? activeTopicIdRef.current,
                ),
            }) as typeof payload;

            progressRef.current = canonicalState;
            lastCommittedRef.current = stableJson(canonicalPayload);
            lastSavedMeaningfulBodyRef.current = meaningfulBodyForPayload(canonicalPayload);
            localDirtyRef.current = false;
            setSaveStatus("saved");
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
        [endpoint, gamificationEnabled, meaningfulBodyForPayload, readOnly],
    );

    const drainSaveQueueRef = useRef<() => Promise<void>>(async () => undefined);

    const drainSaveQueue = useCallback(async () => {
        if (!subjectSlug || !moduleSlug) return;
        if (!hydrationCompleteRef.current) return;
        if (saveInFlightRef.current) return;

        const nextPayload = pendingSavePayloadRef.current;
        if (!nextPayload) return;

        const meaningfulBody = meaningfulBodyForPayload(nextPayload);
        if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
            pendingSavePayloadRef.current = null;
            localDirtyRef.current = false;
            setSaveStatus("saved");
            setLastSaveError(null);
            return;
        }

        pendingSavePayloadRef.current = null;
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
            // Preserve the newest known payload. Do not overwrite it with older snapshots.
            pendingSavePayloadRef.current = pendingSavePayloadRef.current ?? nextPayload;
        } finally {
            saveInFlightRef.current = false;
            if (!failed && pendingSavePayloadRef.current) {
                void drainSaveQueueRef.current();
            }
        }
    }, [subjectSlug, moduleSlug, meaningfulBodyForPayload, savePayloadToApi]);

    useEffect(() => {
        drainSaveQueueRef.current = drainSaveQueue;
    }, [drainSaveQueue]);

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

            const stateToSave = makeSaveState(mergedState);
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

            if (!saveInFlightRef.current && !pendingSavePayloadRef.current) {
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
            const stateToSave = makeSaveState(stateForSave);
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

                const normalizedProgress = normalizeProgressTopics(fetchedProgress);

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
                    state: normalizedProgress,
                    activeTopicId: nextActive,
                });
                prime(hydratedPayload);
                lastSavedMeaningfulBodyRef.current = stableJson({
                    ...hydratedPayload,
                    state: withoutSaveRevision(hydratedPayload.state),
                });
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
                    state: ep,
                    activeTopicId: normalizeTopicProgressKey(firstTopicId),
                });
                prime(emptyPayload);
                lastSavedMeaningfulBodyRef.current = stableJson({
                    ...emptyPayload,
                    state: withoutSaveRevision(emptyPayload.state),
                });
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
        locale,
        endpoint,
        firstTopicId,
        setProgressSafe,
        setActiveTopicId,
        prime,
        hydrateRuntimeFromProgress,
    ]);

    const syncRemoteProgress = useCallback(
        async (reason: string, signal?: AbortSignal) => {
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
                const remoteProgress = normalizeProgressTopics(
                    await fetchReviewProgressGET({
                        subjectSlug,
                        moduleSlug,
                        locale,
                        signal,
                        endpoint,
                    }),
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
                    state: remoteProgress,
                    activeTopicId: nextActive,
                });
                prime(canonicalRemotePayload);
                lastSavedMeaningfulBodyRef.current = stableJson({
                    ...canonicalRemotePayload,
                    state: withoutSaveRevision(canonicalRemotePayload.state),
                });

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
        ],
    );

    useEffect(() => {
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
    }, [subjectSlug, moduleSlug, hydrated, readOnly, syncRemoteProgress]);

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
        saveStatus,
        lastSaveError,
    };
}
