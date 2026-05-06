"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReviewProgressState, ReviewTopicProgress } from "@/lib/review/progressTypes";
import {
    emptyReviewProgress,
    fetchReviewProgressGET,
    buildReviewProgressPayload,
} from "@/lib/review/progressClient";
import { stableJson } from "@/lib/client/persistence/stableJson";
import { useDebouncedCommit } from "@/lib/client/persistence/useDebouncedCommit";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";
import { emitGamificationUpdate } from "@/lib/gamification/browserEvents";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../runtime/runtimeProgressBridge";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "../runtime/reviewSaveDebug";
import { getExerciseStateKey } from "../runtime/exerciseKeys";
import { deriveEntryCode } from "../runtime/exerciseWorkspaceResolver";

const REVIEW_PROGRESS_DEBUG =
    process.env.NEXT_PUBLIC_REVIEW_PROGRESS_DEBUG === "true";

function reviewProgressDebug(message: string, data: Record<string, unknown>) {
    if (!REVIEW_PROGRESS_DEBUG) return;
    console.log(message, data);
}

function isPersistedCardToolKey(toolKey: string) {
    if (typeof toolKey !== "string" || !toolKey.trim()) return false;
    if (toolKey.startsWith("exercise:")) return false;
    return true;
}

function cardIdFromPersistedToolKey(toolKey: string) {
    if (toolKey.startsWith("card:")) return toolKey.replace(/^card:/, "");

    const parts = toolKey.split(":").filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1] === "general") {
        return parts[parts.length - 2];
    }

    return parts[parts.length - 1] || toolKey;
}

function cardStateKeyFromPersistedToolKey(toolKey: string) {
    if (toolKey.startsWith("card:")) return toolKey.replace(/^card:/, "");
    if (toolKey.endsWith(":general")) return toolKey.replace(/:general$/, "");
    return toolKey;
}

function normalizeTopicProgressKey(topicId: string | null | undefined) {
    const raw = String(topicId ?? "").trim();
    if (!raw) return "unknown";

    const parts = raw.split(".").filter(Boolean);
    return parts[parts.length - 1] || raw;
}

function isUserSavedState(value: any) {
    return (
        value?.userEdited === true ||
        value?.workspaceOrigin === "user" ||
        value?.workspaceOrigin === "saved"
    );
}

function numericUpdatedAt(value: any) {
    const n = Number(value?.updatedAt ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function chooseSavedValue<T = any>(existing: T | undefined, incoming: T | undefined): T | undefined {
    const a: any = existing;
    const b: any = incoming;

    if (a == null) return incoming;
    if (b == null) return existing;

    const aIsUser = isUserSavedState(a);
    const bIsUser = isUserSavedState(b);

    if (bIsUser && !aIsUser) return incoming;
    if (aIsUser && !bIsUser) return existing;

    if (numericUpdatedAt(b) > numericUpdatedAt(a)) return incoming;

    return existing;
}

function mergeRecordMap<T = any>(
    existing: Record<string, T> | undefined,
    incoming: Record<string, T> | undefined,
): Record<string, T> | undefined {
    if (!existing && !incoming) return undefined;

    const out: Record<string, T> = {
        ...(existing ?? {}),
    };

    for (const [key, value] of Object.entries(incoming ?? {})) {
        out[key] = chooseSavedValue(out[key], value as T) as T;
    }

    return out;
}

function mergeTopicProgressStates(
    existing: ReviewTopicProgress | undefined,
    incoming: ReviewTopicProgress | undefined,
): ReviewTopicProgress {
    const a: any = existing ?? {};
    const b: any = incoming ?? {};

    const runtimeA = a.runtimeStateV2 ?? {};
    const runtimeB = b.runtimeStateV2 ?? {};

    return {
        ...a,
        ...b,

        cardsDone: {
            ...(a.cardsDone ?? {}),
            ...(b.cardsDone ?? {}),
        },

        quizzesDone: {
            ...(a.quizzesDone ?? {}),
            ...(b.quizzesDone ?? {}),
        },

        quizState: mergeRecordMap(a.quizState, b.quizState) ?? {},

        sketchState: mergeRecordMap(a.sketchState, b.sketchState) ?? {},

        toolState: mergeRecordMap(a.toolState, b.toolState) ?? {},

        runtimeStateV2: {
            ...runtimeA,
            ...runtimeB,
            cards: mergeRecordMap(runtimeA.cards, runtimeB.cards) ?? {},
            exercises: mergeRecordMap(runtimeA.exercises, runtimeB.exercises) ?? {},
        },
    };
}

function normalizeProgressTopics(state: ReviewProgressState | null | undefined): ReviewProgressState {
    const base = state ?? emptyReviewProgress();
    const topics = (base as any).topics ?? {};
    const nextTopics: Record<string, ReviewTopicProgress> = {};

    for (const [key, topicState] of Object.entries(topics)) {
        const canonical = normalizeTopicProgressKey(key);
        nextTopics[canonical] = mergeTopicProgressStates(
            nextTopics[canonical],
            topicState as ReviewTopicProgress,
        );
    }

    const activeTopicId = normalizeTopicProgressKey((base as any).activeTopicId);

    return {
        ...base,
        activeTopicId: activeTopicId === "unknown" ? base.activeTopicId : activeTopicId,
        topics: nextTopics,
    };
}

function getTopicProgressState(
    topics: Record<string, ReviewTopicProgress> | null | undefined,
    activeTopicId: string | null | undefined,
): {
    topicKey: string;
    topic: ReviewTopicProgress | null;
} {
    const canonical = normalizeTopicProgressKey(activeTopicId);
    const map = topics ?? {};

    if (map[canonical]) {
        return {
            topicKey: canonical,
            topic: map[canonical],
        };
    }

    const raw = String(activeTopicId ?? "").trim();

    if (raw && map[raw]) {
        return {
            topicKey: raw,
            topic: map[raw],
        };
    }

    const matchKey = Object.keys(map).find(
        (key) => normalizeTopicProgressKey(key) === canonical,
    );

    if (matchKey) {
        return {
            topicKey: matchKey,
            topic: map[matchKey] ?? null,
        };
    }

    return {
        topicKey: canonical,
        topic: null,
    };
}

function getSaveRevision(state: any) {
    const n = Number(state?.__saveRevision ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function stripTransientProgressFields<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => stripTransientProgressFields(entry)) as T;
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const out: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (key === "__saveRevision" || key === "updatedAt") continue;
        out[key] = stripTransientProgressFields(entry);
    }

    return out as T;
}

function serializeProgressStateForDedupe(state: ReviewProgressState) {
    return stableJson(stripTransientProgressFields(state));
}

function serializeProgressPayloadForDedupe(payload: ReturnType<typeof buildReviewProgressPayload>) {
    return stableJson({
        ...payload,
        state: stripTransientProgressFields(payload.state),
    });
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

function hasSavedExerciseContent(value: any) {
    return Boolean(
        getSavedWorkspace(value) ||
        typeof value?.code === "string" ||
        typeof value?.source === "string" ||
        value?.sketch,
    );
}

function getSavedExerciseCode(value: any, workspace: any) {
    const workspaceCode = deriveEntryCode(workspace) ?? "";
    if (workspaceCode) return workspaceCode;
    if (typeof value?.code === "string") return value.code;
    if (typeof value?.source === "string") return value.source;
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

export function useReviewProgress(args: {
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    firstTopicId: string;
}) {
    const { subjectSlug, moduleSlug, locale, firstTopicId } = args;

    const [progress, setProgress] = useState<ReviewProgressState>(
        emptyReviewProgress(),
    );
    const [hydrated, setHydrated] = useState(false);

    const [viewTopicId, setViewTopicId] = useState(firstTopicId);
    const [activeTopicId, _setActiveTopicId] = useState(firstTopicId);

    const progressRef = useRef(progress);
    const activeTopicIdRef = useRef(firstTopicId);
    const hydrationCompleteRef = useRef(false);
    const applyingRemoteRef = useRef(false);
    const localDirtyRef = useRef(false);
    const remoteSyncInFlightRef = useRef(false);
    const saveInFlightRef = useRef(false);
    const saveInFlightBodyRef = useRef("");
    const pendingSaveRef = useRef<{
        state: ReviewProgressState;
        reason: string;
        keepalive?: boolean;
        syncProgressState?: boolean;
    } | null>(null);
    const lastMergedProgressRef = useRef(
        serializeProgressStateForDedupe(emptyReviewProgress()),
    );

    useEffect(() => {
        progressRef.current = progress;
        lastMergedProgressRef.current = serializeProgressStateForDedupe(progress);
    }, [progress]);

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

    const buildPayloadForState = useCallback(
        (state: ReviewProgressState, activeTopicIdOverride?: string) =>
            buildReviewProgressPayload({
                subjectSlug,
                moduleSlug,
                locale,
                state,
                activeTopicId: normalizeTopicProgressKey(
                    activeTopicIdOverride ?? activeTopicIdRef.current,
                ),
            }),
        [subjectSlug, moduleSlug, locale],
    );

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
        const nextRevision = Math.max(previousRevision + 1, Date.now());

        const stateToSave = {
            ...(stateWithRuntime as any),
            __saveRevision: nextRevision,
        } as ReviewProgressState;

        progressRef.current = stateToSave;

        return stateToSave;
    }

    const performProgressSave = useCallback(
        async (args: {
            state: ReviewProgressState;
            reason: string;
            signal?: AbortSignal;
            keepalive?: boolean;
            syncProgressState?: boolean;
        }) => {
            if (!subjectSlug || !moduleSlug) return { committed: false };
            if (!hydrationCompleteRef.current) return { committed: false };

            const latestRuntime = useReviewRuntimeStore.getState();
            const mergedState = mergeRuntimeIntoProgress(args.state, latestRuntime);
            const candidatePayload = buildPayloadForState(mergedState);
            const candidateSerialized = serializeProgressPayloadForDedupe(candidatePayload);

            if (candidateSerialized === lastCommittedRef.current) {
                localDirtyRef.current = false;
                return { committed: false };
            }

            if (
                saveInFlightRef.current &&
                saveInFlightBodyRef.current === candidateSerialized
            ) {
                return { committed: false };
            }

            const stateToSave = makeSaveState(mergedState);
            const nextPayload = buildPayloadForState(stateToSave);
            const requestBody = stableJson(nextPayload);
            const requestSerialized = serializeProgressPayloadForDedupe(nextPayload);

            if (requestSerialized === lastCommittedRef.current) {
                localDirtyRef.current = false;
                return { committed: false };
            }

            if (
                saveInFlightRef.current &&
                saveInFlightBodyRef.current === requestSerialized
            ) {
                return { committed: false };
            }

            if (saveInFlightRef.current) {
                pendingSaveRef.current = {
                    state: mergedState,
                    reason: args.reason,
                    keepalive: args.keepalive,
                    syncProgressState: args.syncProgressState,
                };
                localDirtyRef.current = true;
                return { committed: false };
            }

            saveInFlightRef.current = true;
            saveInFlightBodyRef.current = requestSerialized;

            reviewProgressDebug("[review-progress-debug] save", {
                reason: args.reason,
                stateBytes: requestBody.length,
                saveRevision: getSaveRevision(stateToSave),
            });

            let result: { committed: boolean } = { committed: false };

            try {
                const res = await fetch("/api/review/progress", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: requestBody,
                    keepalive: args.keepalive === true,
                    cache: "no-store",
                    signal: args.signal,
                });

                if (!res.ok) {
                    const message = await res.text().catch(() => "");
                    console.error("[review-progress] save failed", {
                        status: res.status,
                        message,
                    });
                    return { committed: false };
                }

                lastCommittedRef.current = requestSerialized;
                localDirtyRef.current = false;
                lastMergedProgressRef.current = serializeProgressStateForDedupe(stateToSave);

                if (args.syncProgressState) {
                    setProgressSafe(stateToSave);
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

                result = { committed: true };
            } catch (error: any) {
                if (args.signal?.aborted || error?.name === "AbortError") {
                    return { committed: false };
                }
                console.error("[review-progress] save request failed", error);
                return { committed: false };
            } finally {
                if (saveInFlightBodyRef.current === requestSerialized) {
                    saveInFlightRef.current = false;
                    saveInFlightBodyRef.current = "";
                }
            }

            const pending = pendingSaveRef.current;
            if (pending && !saveInFlightRef.current) {
                pendingSaveRef.current = null;
                return performProgressSave(pending);
            }

            return result;
        },
        [buildPayloadForState, moduleSlug, setProgressSafe, subjectSlug],
    );

    const commitProgress = useCallback(
        async (_payload: typeof payload, _body: string, signal: AbortSignal) => {
            return performProgressSave({
                state: progressRef.current,
                reason: "debounce",
                signal,
                syncProgressState: false,
            });
        },
        [performProgressSave],
    );

    const {
        prime,
        flush,
        cancel,
        lastCommittedRef,
        hasPendingRef,
    } = useDebouncedCommit({
        value: payload,
        enabled: hydrated && Boolean(subjectSlug && moduleSlug),
        delayMs: 900,
        serialize: serializeProgressPayloadForDedupe,
        commit: commitProgress,
    });

    const putProgressNow = useCallback(
        async (
            state: ReviewProgressState,
            options?: {
                keepalive?: boolean;
                reason?: string;
            },
        ) => {
            await performProgressSave({
                state,
                reason: options?.reason ?? "manual",
                keepalive: options?.keepalive,
                syncProgressState: true,
            });
        },
        [performProgressSave],
    );

    const hydrateRuntimeFromProgress = useCallback(
        (normalizedProgress: ReviewProgressState, reason: string) => {
            const topics = (normalizedProgress as any).topics ?? {};
            if (!topics) return;

            const resolvedForLog = getTopicProgressState(
                topics,
                (normalizedProgress as any).activeTopicId || firstTopicId,
            );

            reviewProgressDebug("[review-progress-debug] hydrate", {
                reason,
                activeTopicId: (normalizedProgress as any).activeTopicId || firstTopicId,
                resolvedTopicKey: resolvedForLog.topicKey,
            });

            const resolveExerciseKey = (rawKey: string, saved: any, tid: string, cardIdHint = "") => {
                const explicit =
                    typeof saved?.exerciseKey === "string" && saved.exerciseKey.trim()
                        ? saved.exerciseKey
                        : typeof saved?.exerciseStateKey === "string" && saved.exerciseStateKey.trim()
                            ? saved.exerciseStateKey
                            : "";

                const candidate = explicit || rawKey;
                const canonicalCandidate = canonicalizeExerciseStateKey(candidate, tid);
                if (canonicalCandidate.split(":").filter(Boolean).length >= 6) {
                    return canonicalCandidate;
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
                const workspace = getSavedWorkspace(saved);
                const code = getSavedExerciseCode(saved, workspace);
                const stdin = getSavedExerciseStdin(saved, workspace);
                const language = getSavedExerciseLanguage(
                    saved,
                    workspace,
                    existingExercise?.language ?? "python",
                );
                const userEdited =
                    isUserSavedState(saved) ||
                    (Boolean(workspace) &&
                        saved?.workspaceOrigin !== "starter" &&
                        saved?.workspaceOrigin !== "empty" &&
                        saved?.userEdited !== false);
                const workspaceOrigin =
                    saved?.workspaceOrigin ??
                    (userEdited ? "saved" : Boolean(workspace) ? "starter" : undefined);

                const incomingExercise = {
                    ...saved,
                    exerciseKey: canonicalExerciseKey,
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
                    workspace: workspace ?? saved?.workspace,
                    codeWorkspace: workspace ?? saved?.codeWorkspace,
                    ideWorkspace: workspace ?? saved?.ideWorkspace,
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

                if (
                    !looksLikeBetterExerciseRestoreCandidate(
                        existingExercise,
                        incomingExercise,
                    )
                ) {
                    return;
                }

                reviewSaveDebug("hydrate exercise from DB", () => ({
                    reason,
                    source,
                    rawKey,
                    canonicalExerciseKey,
                    topicId,
                    cardIdHint,
                    userEdited: incomingExercise.userEdited,
                    workspaceOrigin: incomingExercise.workspaceOrigin,
                    workspace: summarizeWorkspaceForSave(workspace),
                }));

                const runtimeApi = useReviewRuntimeStore.getState();
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
                runtimeApi.patchExercise(canonicalExerciseKey, incomingExercise as any);
            };

            Object.entries(topics).forEach(([tidRaw, tp]: any) => {
                const tid = normalizeTopicProgressKey(tidRaw);

                if (tp.toolState) {
                    Object.entries(tp.toolState).forEach(([toolKey, toolEntry]) => {
                        const key = String(toolKey);
                        const entry = toolEntry as any;
                        const workspace = getSavedWorkspace(entry);
                        if (!workspace) return;

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

                        const cardId = cardIdFromPersistedToolKey(key);
                        const cardKey = cardStateKeyFromPersistedToolKey(key);
                        const userEdited = isUserSavedState(entry);

                        reviewSaveDebug("hydrate toolState from DB", () => ({
                            reason,
                            persistedToolKey: key,
                            hydratedCardKey: cardKey,
                            topicId: tid,
                            cardId,
                            userEdited,
                            workspaceOrigin: entry.workspaceOrigin,
                            workspace: summarizeWorkspaceForSave(workspace),
                        }));

                        const runtimeApi = useReviewRuntimeStore.getState();
                        runtimeApi.ensureCard({
                            cardKey,
                            topicId: tid,
                            cardId,
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
                        } as any);
                    });
                }

                if (tp.runtimeStateV2?.cards) {
                    Object.entries(tp.runtimeStateV2.cards).forEach(([ckey, cstate]) => {
                        const savedCard = cstate as any;
                        const userEdited = isUserSavedState(savedCard);

                        reviewSaveDebug("hydrate card from DB", () => ({
                            reason,
                            cardKey: ckey,
                            topicId: tid,
                            cardId: savedCard.cardId || "",
                            userEdited,
                            workspaceOrigin: savedCard.workspaceOrigin,
                            toolKey: savedCard.toolKey,
                            toolWorkspace: summarizeWorkspaceForSave(savedCard.toolWorkspace),
                        }));

                        useReviewRuntimeStore.getState().ensureCard({
                            cardKey: ckey,
                            topicId: tid,
                            cardId: savedCard.cardId || "",
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
        [firstTopicId, moduleSlug, subjectSlug],
    );

    useEffect(() => {
        if (!subjectSlug || !moduleSlug) return;

        const ctrl = new AbortController();

        hydrationCompleteRef.current = false;
        setHydrated(false);

        (async () => {
            try {
                const fetchedProgress = await fetchReviewProgressGET({
                    subjectSlug,
                    moduleSlug,
                    locale,
                    signal: ctrl.signal,
                });

                const normalizedProgress = normalizeProgressTopics(fetchedProgress);
                applyingRemoteRef.current = true;

                setProgressSafe(normalizedProgress);
                hydrateRuntimeFromProgress(normalizedProgress, "initial");

                const nextActive = normalizeTopicProgressKey(
                    (normalizedProgress as any).activeTopicId || firstTopicId,
                );

                setActiveTopicId(nextActive);
                setViewTopicId(nextActive);

                prime(buildPayloadForState(normalizedProgress, nextActive));
                localDirtyRef.current = false;
                lastMergedProgressRef.current =
                    serializeProgressStateForDedupe(normalizedProgress);
            } catch {
                const ep = emptyReviewProgress();
                applyingRemoteRef.current = true;

                setProgressSafe(ep);
                setActiveTopicId(firstTopicId);
                setViewTopicId(firstTopicId);

                prime(buildPayloadForState(ep, firstTopicId));
                localDirtyRef.current = false;
                lastMergedProgressRef.current = serializeProgressStateForDedupe(ep);
            } finally {
                applyingRemoteRef.current = false;
                hydrationCompleteRef.current = true;
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
        buildPayloadForState,
        hydrateRuntimeFromProgress,
    ]);

    const syncRemoteProgress = useCallback(
        async (reason: string, signal?: AbortSignal) => {
            if (!subjectSlug || !moduleSlug) return;
            if (!hydrated || !hydrationCompleteRef.current) return;
            if (typeof document !== "undefined" && document.visibilityState !== "visible") {
                return;
            }
            if (localDirtyRef.current) return;
            if (saveInFlightRef.current) return;
            if (remoteSyncInFlightRef.current) return;
            if (hasPendingRef.current) return;

            remoteSyncInFlightRef.current = true;

            let applied = false;
            try {
                const remoteProgress = normalizeProgressTopics(
                    await fetchReviewProgressGET({
                        subjectSlug,
                        moduleSlug,
                        locale,
                        signal,
                    }),
                );

                const remoteRevision = getSaveRevision(remoteProgress);
                const localRevision = getSaveRevision(progressRef.current);

                if (!remoteRevision || remoteRevision <= localRevision) {
                    return;
                }

                applyingRemoteRef.current = true;
                cancel();

                hydrateRuntimeFromProgress(remoteProgress, reason);

                const nextActive = normalizeTopicProgressKey(
                    (remoteProgress as any).activeTopicId || activeTopicIdRef.current || firstTopicId,
                );

                progressRef.current = remoteProgress;
                setProgressSafe(remoteProgress);
                setActiveTopicId(nextActive);
                setViewTopicId(nextActive);
                localDirtyRef.current = false;
                lastMergedProgressRef.current =
                    serializeProgressStateForDedupe(remoteProgress);

                prime(buildPayloadForState(remoteProgress, nextActive));

                applied = true;
            } catch (error: any) {
                if (signal?.aborted || error?.name === "AbortError") return;
                console.error("[review-progress] remote sync failed", error);
            } finally {
                applyingRemoteRef.current = false;
                remoteSyncInFlightRef.current = false;
                if (REVIEW_PROGRESS_DEBUG && applied) {
                    reviewProgressDebug("[review-progress-debug] remote-sync", {
                        reason,
                    });
                }
            }
        },
        [
            subjectSlug,
            moduleSlug,
            hydrated,
            cancel,
            hydrateRuntimeFromProgress,
            firstTopicId,
            setProgressSafe,
            setActiveTopicId,
            prime,
            buildPayloadForState,
            hasPendingRef,
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
            if (localDirtyRef.current) return;
            if (saveInFlightRef.current) return;
            if (remoteSyncInFlightRef.current) return;
            if (hasPendingRef.current) return;
            poll("poll");
        }, 30000);

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                if (localDirtyRef.current) return;
                if (saveInFlightRef.current) return;
                if (remoteSyncInFlightRef.current) return;
                if (hasPendingRef.current) return;
                poll("visible");
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            ctrl.abort();
        };
    }, [subjectSlug, moduleSlug, hydrated, syncRemoteProgress, hasPendingRef]);

    useFlushOnPageExit(() => {
        if (!hydrated || !hydrationCompleteRef.current) return;

        cancel();

        const latestProgress = mergeRuntimeIntoProgress(
            progressRef.current,
            useReviewRuntimeStore.getState(),
        );

        progressRef.current = latestProgress;

        void putProgressNow(latestProgress, {
            reason: "page-exit",
            keepalive: false,
        });
    }, hydrated);

    useEffect(() => {
        if (!hydrated || !hydrationCompleteRef.current) return;

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
    }, [hydrated, subjectSlug, moduleSlug, locale, cancel, putProgressNow]);

    useEffect(() => {
        if (!hydrated || !hydrationCompleteRef.current) return;

        const unsub = useReviewRuntimeStore.subscribe((runtimeState) => {
            if (!hydrationCompleteRef.current) return;
            if (applyingRemoteRef.current) return;

            setProgressSafe((prev: ReviewProgressState) => {
                const next = mergeRuntimeIntoProgress(prev, runtimeState);
                const prevSerialized = lastMergedProgressRef.current;
                const nextSerialized = serializeProgressStateForDedupe(next);

                if (nextSerialized === prevSerialized) return prev;

                lastMergedProgressRef.current = nextSerialized;
                localDirtyRef.current = true;
                progressRef.current = next;
                return next;
            });
        });

        return () => {
            unsub();
        };
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
