"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReviewProgressState, ReviewTopicProgress } from "@/lib/review/progressTypes";
import {
    emptyReviewProgress,
    fetchReviewProgressGET,
    buildReviewProgressPayload,
} from "@/lib/review/progressClient";
import { stableJson } from "@/lib/client/persistence/stableJson";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";
import { emitGamificationUpdate } from "@/lib/gamification/browserEvents";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../runtime/runtimeProgressBridge";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "../runtime/reviewSaveDebug";
import { getExerciseStateKey } from "../runtime/exerciseKeys";
import { deriveEntryCode } from "../runtime/exerciseWorkspaceResolver";
import { stateLanguageMatches } from "../runtime/workspaceCodeSource";

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
function workspaceContentHash(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const files = workspace.nodes
        .filter((node: any) => node?.kind === "file")
        .map((node: any) => ({
            id: String(node.id ?? ""),
            name: String(node.name ?? ""),
            content: String(node.content ?? ""),
        }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        entryFileId: workspace.entryFileId ?? null,
        activeFileId: workspace.activeFileId ?? null,
        files,
    });
}

function savedStarterHashMatchesRuntimeStarter(args: {
    saved: any;
    existingStarterHash?: string | null;
    existingWorkspace?: any;
}) {
    const savedStarterHash =
        typeof args.saved?.starterHash === "string" ? args.saved.starterHash : "";

    if (!savedStarterHash) {
        return false;
    }

    const runtimeStarterHash =
        typeof args.existingStarterHash === "string" && args.existingStarterHash
            ? args.existingStarterHash
            : workspaceContentHash(args.existingWorkspace);

    return savedStarterHash === runtimeStarterHash;
}
function numericUpdatedAt(value: any) {
    const n = Number(value?.updatedAt ?? 0);
    return Number.isFinite(n) ? n : 0;
}


function savedWorkspaceSummary(value: any) {
    const workspace =
        value?.workspace ?? value?.codeWorkspace ?? value?.ideWorkspace ?? value?.toolWorkspace ?? null;
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return { hasWorkspace: false, fileCount: 0 };
    }

    return {
        hasWorkspace: true,
        fileCount: workspace.nodes.filter((node: any) => node?.kind === "file").length,
    };
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

    const aUpdatedAt = numericUpdatedAt(a);
    const bUpdatedAt = numericUpdatedAt(b);

    // Canonical conflict rule: the freshest persisted record wins. File-count
    // heuristics are only a tie-breaker, never a reason for an older local copy
    // to hide a newer DB version on another computer.
    if (bUpdatedAt > aUpdatedAt) return incoming;
    if (aUpdatedAt > bUpdatedAt) return existing;

    const aWorkspace = savedWorkspaceSummary(a);
    const bWorkspace = savedWorkspaceSummary(b);

    if (aWorkspace.hasWorkspace !== bWorkspace.hasWorkspace) {
        return bWorkspace.hasWorkspace ? incoming : existing;
    }

    if (aWorkspace.fileCount !== bWorkspace.fileCount) {
        return bWorkspace.fileCount > aWorkspace.fileCount ? incoming : existing;
    }

    return incoming;
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

function getSaveRevision(state: any) {
    const n = Number(state?.__saveRevision ?? 0);
    return Number.isFinite(n) ? n : 0;
}


function mergeProgressStatesForSave(
    remoteState: ReviewProgressState | null | undefined,
    localState: ReviewProgressState | null | undefined,
): ReviewProgressState {
    const remote = normalizeProgressTopics(remoteState ?? emptyReviewProgress());
    const local = normalizeProgressTopics(localState ?? emptyReviewProgress());
    const nextTopics: Record<string, ReviewTopicProgress> = {
        ...(remote.topics ?? {}),
    };

    for (const [topicKey, localTopic] of Object.entries(local.topics ?? {})) {
        const canonicalTopicKey = normalizeTopicProgressKey(topicKey);
        nextTopics[canonicalTopicKey] = mergeTopicProgressStates(
            nextTopics[canonicalTopicKey],
            localTopic as ReviewTopicProgress,
        );
    }

    return {
        ...remote,
        ...local,
        quizVersion: Math.max(Number((remote as any).quizVersion ?? 0), Number((local as any).quizVersion ?? 0)),
        moduleCompleted: Boolean((remote as any).moduleCompleted || (local as any).moduleCompleted),
        moduleCompletedAt: pickLatestIsoLike((remote as any).moduleCompletedAt, (local as any).moduleCompletedAt),
        activeTopicId: normalizeTopicProgressKey((local as any).activeTopicId ?? (remote as any).activeTopicId),
        topics: nextTopics,
        __saveRevision: Math.max(getSaveRevision(remote), getSaveRevision(local), Date.now()),
    } as ReviewProgressState;
}

function timeMsLike(value: unknown) {
    const n = Number(new Date(String(value ?? "")));
    return Number.isFinite(n) ? n : 0;
}

function pickLatestIsoLike(a: unknown, b: unknown) {
    const aMs = timeMsLike(a);
    const bMs = timeMsLike(b);
    if (!aMs && !bMs) return undefined;
    return bMs >= aMs ? (b as string | undefined) : (a as string | undefined);
}

function withoutSaveRevision(value: any): any {
    if (Array.isArray(value)) {
        return value.map((item) => withoutSaveRevision(item));
    }

    if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === "__saveRevision") continue;
            out[key] = withoutSaveRevision(item);
        }
        return out;
    }

    return value;
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

function workspaceHasNonBlankCode(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    const code = deriveEntryCode(workspace);
    return typeof code === "string" && code.trim().length > 0;
}

function hasSavedExerciseContent(value: any) {
    const workspace = getSavedWorkspace(value);

    const hasNonBlankCode =
        workspaceHasNonBlankCode(workspace) ||
        (typeof value?.code === "string" && value.code.trim().length > 0) ||
        (typeof value?.source === "string" && value.source.trim().length > 0);

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
        (typeof value?.code === "string" && value.code.trim().length > 0) ||
        (typeof value?.source === "string" && value.source.trim().length > 0),
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

type ReviewSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

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
    const saveSeqRef = useRef(0);
    const hydrationCompleteRef = useRef(false);
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

    useEffect(() => {
        store.setTopicIds(activeTopicId, viewTopicId);
    }, [activeTopicId, viewTopicId]); // eslint-disable-line react-hooks/exhaustive-deps

    const setProgressSafe = useCallback((updater: any) => {
        setProgress((prev: any) => {
            const next = typeof updater === "function" ? updater(prev) : updater;
            if (next === prev) {
                progressRef.current = next;
                return next;
            }

            if (hydrationCompleteRef.current && !applyingRemoteRef.current) {
                const prevBody = stableJson(withoutSaveRevision(prev));
                const nextBody = stableJson(withoutSaveRevision(next));
                if (prevBody !== nextBody) {
                    localDirtyRef.current = true;
                }
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
        const nextRevision = Math.max(previousRevision + 1, Date.now());

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

    const savePayloadToApi = useCallback(
        async (nextPayload: typeof payload, options?: { keepalive?: boolean; reason?: string }) => {
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
             * Cross-device safety:
             * Before a normal autosave, fetch the newest DB progress and merge
             * this tab's workspace changes on top of it. This prevents a stale
             * tab/device from writing an older snapshot that hides SQL/Python
             * files created elsewhere. Page-exit keepalive saves skip the extra
             * GET because browsers may cancel that request; the server still
             * performs its own merge/revision check for those emergency saves.
             */
            if (!options?.keepalive) {
                try {
                    const latestRemote = await fetchReviewProgressGET({
                        subjectSlug: payloadToSave.subjectSlug,
                        moduleSlug: payloadToSave.moduleSlug,
                        locale: payloadToSave.locale,
                    });

                    const remoteRevision = getSaveRevision(latestRemote);
                    const localRevision = getSaveRevision(payloadToSave.state);

                    if (remoteRevision > localRevision || remoteRevision > 0) {
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
                                (payloadToSave.state as any).activeTopicId ?? activeTopicIdRef.current,
                            ),
                        }) as typeof payload;

                        progressRef.current = payloadToSave.state as ReviewProgressState;
                        body = stableJson(payloadToSave);
                        meaningfulBody = meaningfulBodyForPayload(payloadToSave);
                    }
                } catch (error: any) {
                    console.warn("[review-progress] pre-save remote merge failed", {
                        reason: options?.reason,
                        message: error?.message ?? String(error),
                    });
                }
            }

            const ac = options?.keepalive ? null : new AbortController();
            const timeout = ac ? window.setTimeout(() => ac.abort(), 15000) : null;

            const putOnce = async (requestBody: string) => {
                return fetch("/api/review/progress", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: requestBody,
                    keepalive: options?.keepalive === true,
                    cache: "no-store",
                    signal: ac?.signal,
                });
            };

            let res = await putOnce(body).finally(() => {
                if (timeout != null) window.clearTimeout(timeout);
            });

            if (res.status === 409 && !options?.keepalive) {
                const latestRemote = await fetchReviewProgressGET({
                    subjectSlug: payloadToSave.subjectSlug,
                    moduleSlug: payloadToSave.moduleSlug,
                    locale: payloadToSave.locale,
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
                        (payloadToSave.state as any).activeTopicId ?? activeTopicIdRef.current,
                    ),
                }) as typeof payload;
                body = stableJson(payloadToSave);
                meaningfulBody = meaningfulBodyForPayload(payloadToSave);
                res = await putOnce(body);
            }

            if (!res.ok) {
                const message = await res.text().catch(() => "");
                if (res.status === 409) {
                    const error = new Error(message || "Review progress conflict");
                    (error as any).status = 409;
                    throw error;
                }
                throw new Error(message || `Progress save failed: ${res.status}`);
            }

            const data = await res.json().catch(() => null);
            const canonicalState = data?.state
                ? normalizeProgressTopics(data.state as ReviewProgressState)
                : (payloadToSave.state as ReviewProgressState);
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
        },
        [meaningfulBodyForPayload],
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

        let savingUiTimer: number | null = null;
        let failed = false;
        try {
            savingUiTimer = window.setTimeout(() => setSaveStatus("saving"), 400);
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
            if (savingUiTimer != null) window.clearTimeout(savingUiTimer);
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
            if (applyingRemoteRef.current) return;

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
                void drainSaveQueueRef.current();
                return;
            }

            pendingSaveTimerRef.current = window.setTimeout(() => {
                pendingSaveTimerRef.current = null;
                void drainSaveQueueRef.current();
            }, 2500);
        },
        [subjectSlug, moduleSlug, buildPayloadFromState, meaningfulBodyForPayload],
    );
    const sleep = (ms: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, ms));


    const flush = useCallback(async () => {
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
    }, [queueProgressSave]);


    const putProgressNow = useCallback(
        async (
            state: ReviewProgressState,
            options?: {
                keepalive?: boolean;
                reason?: string;
            },
        ) => {
            if (!subjectSlug || !moduleSlug) return;
            if (!hydrationCompleteRef.current) return;

            const latestRuntime = useReviewRuntimeStore.getState();
            const mergedState = mergeRuntimeIntoProgress(state, latestRuntime);
            const meaningfulPayload = buildPayloadFromState(withoutSaveRevision(mergedState) as ReviewProgressState);
            const meaningfulBody = meaningfulBodyForPayload(meaningfulPayload as any);

            if (meaningfulBody === lastSavedMeaningfulBodyRef.current) {
                localDirtyRef.current = false;
                setSaveStatus("saved");
                return;
            }

            const saveSeq = ++saveSeqRef.current;
            const stateToSave = makeSaveState(mergedState);
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
            await drainSaveQueueRef.current();
            if (saveSeq === saveSeqRef.current && lastSavedMeaningfulBodyRef.current === meaningfulBody) {
                setProgressSafe(stateToSave);
            }
        },
        [subjectSlug, moduleSlug, buildPayloadFromState, meaningfulBodyForPayload, savePayloadToApi, setProgressSafe],
    );

    const hydrateRuntimeFromProgress = useCallback(
        (normalizedProgress: ReviewProgressState, reason: string) => {
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
                const savedWorkspace = getSavedWorkspace(saved);
                const savedHasEditorContent = hasSavedExerciseEditorContent(saved);

                /**
                 * Progress-only saved entries are still useful, but they must not
                 * pre-seed a runtime exercise before the real manifest-backed
                 * exercise registers. Otherwise a blank DB/local patch becomes the
                 * initial "manifest" and starterCode never gets a chance to win.
                 */
                if (!savedHasEditorContent && !existingExercise) {
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

                /**
                 * Important:
                 * If the curriculum starter changed, do NOT restore old editor/workspace code.
                 * But still hydrate saved progress fields like checked/correct/submitted.
                 */
                const shouldDropSavedWorkspace =
                    !savedMatchesCurrentStarter && Boolean(existingExercise?.starterHash);

                const savedMatchesExistingLanguage =
                    !existingExercise?.language ||
                    stateLanguageMatches(
                        saved,
                        existingExercise.language,
                        savedWorkspace,
                    );

                const shouldHydrateEditorState =
                    savedHasEditorContent &&
                    !shouldDropSavedWorkspace &&
                    savedMatchesExistingLanguage;

                const workspace =
                    !shouldHydrateEditorState
                        ? existingExercise?.workspace ??
                        existingExercise?.codeWorkspace ??
                        existingExercise?.ideWorkspace ??
                        null
                        : savedWorkspace;

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

                if (
                    !looksLikeBetterExerciseRestoreCandidate(
                        existingExercise,
                        incomingExercise,
                    )
                ) {
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

                        const cardId = cardIdFromPersistedToolKey(key);
                        const cardKey = cardStateKeyFromPersistedToolKey(key);
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

                setProgressSafe(normalizedProgress);
                hydrateRuntimeFromProgress(normalizedProgress, "initial");

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
            } catch {
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
                if (localDirtyRef.current) {
                    await flush();
                }

                if (localDirtyRef.current || saveInFlightRef.current || pendingSavePayloadRef.current) {
                    return;
                }

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

                if (remoteRevision <= localRevision && remoteMeaningfulBody === localMeaningfulBody) {
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
            hydrated,
            flush,
            cancel,
            hydrateRuntimeFromProgress,
            firstTopicId,
            setProgressSafe,
            setActiveTopicId,
            meaningfulBodyForPayload,
            prime,
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
            if (localDirtyRef.current || remoteSyncInFlightRef.current || saveInFlightRef.current) return;
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
    }, [subjectSlug, moduleSlug, hydrated, syncRemoteProgress]);

    useEffect(() => {
        if (!hydrated || !hydrationCompleteRef.current) return;
        if (applyingRemoteRef.current) return;
        if (!localDirtyRef.current) return;

        queueProgressSave(progressRef.current, { reason: "progress-change" });
    }, [payload, hydrated, queueProgressSave]);

    useEffect(() => {
        if (!hydrated || typeof window === "undefined") return;

        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!localDirtyRef.current && !saveInFlightRef.current && !pendingSavePayloadRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [hydrated]);

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
                queueProgressSave(next, { reason: "runtime-store" });
            }, 1800);
        });

        return () => {
            unsub();
            if (runtimeSaveTimerRef.current != null) {
                window.clearTimeout(runtimeSaveTimerRef.current);
                runtimeSaveTimerRef.current = null;
            }
        };
    }, [hydrated, queueProgressSave]);

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
