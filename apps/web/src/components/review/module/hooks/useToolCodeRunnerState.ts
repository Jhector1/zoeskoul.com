"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { useDebouncedCommit } from "@/lib/client/persistence/useDebouncedCommit";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import {
    resolveSqlRunnerConfig,
    type SqlTableSnapshots,
} from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { deriveEntryCode } from "../runtime/exerciseWorkspaceResolver";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "../runtime/reviewSaveDebug";
import { getTopicProgressState, normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";

type BoundTarget = { id: string; exerciseKey?: string; onPatch: (patch: any) => void };

type ToolSnap = {
    topicId: string;
    toolKey: string;

    lang: WorkspaceLanguage;
    code: string;
    stdin: string;
    workspace?: WorkspaceStateV2 | null;
    workspaceKey: string;

    sqlDialect: SqlDialect;
    sqlDatasetId?: string;

    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
};

function snapKey(s: ToolSnap) {
    return [
        s.topicId,
        s.toolKey,
        s.lang,
        s.sqlDialect,
        s.sqlDatasetId ?? "",
        s.stdin,
        s.code,
        s.workspaceKey,
        s.sqlSchemaSql ?? "",
        s.sqlSeedSql ?? "",
        JSON.stringify(s.sqlInitialTableSnapshots ?? {}),
    ].join("::");
}

function workspaceKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const folderPathById = new Map<string, string>();

    let changed = true;
    while (changed) {
        changed = false;

        for (const node of workspace.nodes as any[]) {
            if (!node || node.kind !== "folder") continue;

            const id = String(node.id ?? "");
            if (!id || folderPathById.has(id)) continue;

            const name = String(node.name ?? "");
            const parentId = node.parentId == null ? null : String(node.parentId);
            if (parentId && !folderPathById.has(parentId)) continue;

            const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
            folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
            changed = true;
        }
    }

    const filePath = (node: any) => {
        const name = String(node?.name ?? "");
        const parentId = node?.parentId == null ? null : String(node.parentId);
        const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
        return parentPath ? `${parentPath}/${name}` : name;
    };

    const files = (workspace.nodes as any[])
        .filter((node) => node?.kind === "file")
        .map((node) => ({
            path: filePath(node),
            content: String(node.content ?? ""),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

    const activeNode = (workspace.nodes as any[]).find(
        (node) => node?.kind === "file" && node.id === workspace.activeFileId,
    );
    const entryNode = (workspace.nodes as any[]).find(
        (node) => node?.kind === "file" && node.id === workspace.entryFileId,
    );

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        activePath: activeNode ? filePath(activeNode) : null,
        entryPath: entryNode ? filePath(entryNode) : null,
        files,
    });
}

function firstNonBlank(...values: Array<string | null | undefined>) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
}

function workspaceWithEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
    code: string,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }

    const preferredEntryId = workspace.entryFileId || workspace.activeFileId;
    const fallbackFile = workspace.nodes.find((node) => node.kind === "file");
    const entryId = workspace.nodes.some(
        (node) => node.kind === "file" && node.id === preferredEntryId,
    )
        ? preferredEntryId
        : fallbackFile?.id;
    if (!entryId) return workspace;

    let changed = false;

    const nodes = workspace.nodes.map((node) => {
        if (node.kind !== "file" || node.id !== entryId) return node;
        if (String(node.content ?? "") === code) return node;

        changed = true;
        return {
            ...node,
            content: code,
            updatedAt: Date.now(),
        };
    });

    return changed ? { ...workspace, nodes } : workspace;
}


function ideConfigKey(config: LearningIdeConfig | null | undefined) {
    return JSON.stringify(config ?? null);
}


function resolveExerciseStoreKey(
    exercises: Record<string, any>,
    inputId: string | null | undefined,
    explicitExerciseKey?: string | null,
) {
    const canonicalExplicitExerciseKey = canonicalizeExerciseStateKey(explicitExerciseKey);
    if (canonicalExplicitExerciseKey && exercises[canonicalExplicitExerciseKey]) {
        return canonicalExplicitExerciseKey;
    }
    if (canonicalExplicitExerciseKey) return canonicalExplicitExerciseKey;

    if (inputId && exercises[inputId]) return inputId;

    if (inputId) {
        const found = Object.entries(exercises).find(([key, value]) => {
            if (!value) return false;

            return (
                value.exerciseId === inputId ||
                value.exerciseKey === inputId ||
                key.endsWith(`:${inputId}`)
            );
        });

        if (found) return found[0];
    }

    return inputId ?? null;
}

function canonicalizeExerciseStateKey(exerciseKey: string | null | undefined) {
    if (typeof exerciseKey !== "string") return null;

    const raw = exerciseKey.trim();
    if (!raw) return null;

    const parts = raw.split(":").filter(Boolean);
    if (parts.length < 6) return raw;

    const [subjectSlug, moduleSlug, sectionSlug, topicId, cardId, ...exerciseParts] = parts;
    if (!exerciseParts.length) return raw;

    const normalizedTopicId = normalizeTopicProgressKey(topicId);

    return [
        subjectSlug,
        moduleSlug,
        sectionSlug,
        normalizedTopicId,
        cardId,
        ...exerciseParts,
    ].join(":");
}

function isExerciseToolKey(toolKey: string | null | undefined) {
    return typeof toolKey === "string" && toolKey.startsWith("exercise:");
}

function isCardToolKey(toolKey: string | null | undefined) {
    if (typeof toolKey !== "string" || !toolKey.trim()) return false;
    if (isExerciseToolKey(toolKey)) return false;

    // Legacy card scope.
    if (toolKey.startsWith("card:")) return true;

    // Current review card/sketch scope shapes:
    // subject:module:topic:cardId:general
    // subject:module:section:topic:cardId
    //
    // The second shape is what CodeRunner logs as editorOwnerKey/cardRuntimeKey.
    // Treat any non-exercise review tool key as a card/sketch tool key so edits
    // are persisted through patchCard.
    return true;
}

function cardIdFromToolKey(toolKey: string) {
    if (toolKey.startsWith("card:")) {
        return toolKey.replace(/^card:/, "");
    }

    const parts = toolKey.split(":").filter(Boolean);

    if (parts.length >= 2 && parts[parts.length - 1] === "general") {
        return parts[parts.length - 2];
    }

    return parts[parts.length - 1] || toolKey;
}

function cardStateKeyFromToolKey(toolKey: string) {
    if (toolKey.startsWith("card:")) return toolKey.replace(/^card:/, "");
    if (toolKey.endsWith(":general")) return toolKey.replace(/:general$/, "");

    // Keep the full current review scope key.
    // This must match CodeToolPane/CodeRunner editorOwnerKey/cardRuntimeKey.
    return toolKey;
}

export function useToolCodeRunnerState(args: {
    progress: any;
    progressHydrated: boolean;
    setProgress: (updater: any) => void;
    viewTid: string;

    scopeKey?: string;
    defaultLang?: WorkspaceLanguage;
    defaultCode?: string;
    defaultStdin?: string;
    defaultSqlDialect?: SqlDialect;

    rightCollapsed: boolean;
    rightW: number;

    toolSaveDelayMs?: number;
}) {
    const {
        progress,
        progressHydrated,
        setProgress,
        viewTid,
        scopeKey = "card:general",
        defaultLang = "python",
        defaultCode = `print("Hello World!")`,
        defaultStdin = "",
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
        rightCollapsed,
        rightW,
        toolSaveDelayMs = 700,
    } = args;

    const exercises = useReviewRuntimeStore((s) => s.exercises);
    const patchCard = useReviewRuntimeStore((s) => s.patchCard);

    const versionStr = useMemo(() => {
        const moduleV = (progress as any)?.quizVersion ?? 0;
        const topicV = (progress as any)?.topics?.[viewTid]?.quizVersion ?? 0;
        return `${moduleV}.${topicV}`;
    }, [progress, viewTid]);

    const boundRef = useRef<BoundTarget | null>(null);
    const [boundId, setBoundId] = useState<string | null>(null);
    const boundDirtyRef = useRef(false);
    const lastBindKeyRef = useRef<string>("");
    const bindingContext = useMemo(
        () => `${viewTid}::${scopeKey}::${versionStr}`,
        [viewTid, scopeKey, versionStr],
    );
    const boundContextRef = useRef<string>("");
    const effectiveBoundId =
        boundContextRef.current === bindingContext ? boundId : null;
    const isBound = useCallback(
        (id: string) =>
            boundContextRef.current === bindingContext && boundRef.current?.id === id,
        [bindingContext],
    );

    const clearBoundState = useCallback(() => {
        boundRef.current = null;
        boundContextRef.current = "";
        boundDirtyRef.current = false;
        lastBindKeyRef.current = "";
        setBoundId((prev) => (prev === null ? prev : null));
        setHydratedToolIdentity("");
    }, []);

    const effectiveToolKey = effectiveBoundId ? `exercise:${effectiveBoundId}` : scopeKey;
    const toolIdentity = useMemo(
        () => `${viewTid}::${effectiveToolKey}::${versionStr}`,
        [viewTid, effectiveToolKey, versionStr],
    );

    const saved = useMemo(() => {
        if (isCardToolKey(effectiveToolKey)) {
            return null;
        }
        if (effectiveBoundId) {
            const storeKey = resolveExerciseStoreKey(exercises, effectiveBoundId);
            const found = storeKey ? exercises[storeKey] ?? null : null;
            if (found) return found;

            if (effectiveBoundId.includes(":")) return null;
        }
        const resolved = getTopicProgressState((progress as any)?.topics ?? {}, viewTid);
        return (resolved.topic as any)?.toolState?.[effectiveToolKey] ?? null;
    }, [progress, viewTid, effectiveToolKey, effectiveBoundId, exercises]);

    const initialLang = (saved?.lang as WorkspaceLanguage) ?? defaultLang;
    const initialWorkspace =
        saved?.workspace && typeof saved.workspace === "object"
            ? (saved.workspace as WorkspaceStateV2)
            : null;
    const initialCode = deriveEntryCode(initialWorkspace) || (typeof saved?.code === "string" ? saved.code : defaultCode);
    const initialStdin =
        typeof initialWorkspace?.stdin === "string"
            ? initialWorkspace.stdin
            : typeof saved?.stdin === "string"
                ? saved.stdin
                : defaultStdin;
    const initialWorkspaceKey = workspaceKeyOf(initialWorkspace);

    const initialResolvedSql = resolveSqlRunnerConfig({
        language: initialLang,
        sqlDialect: (saved?.sqlDialect as SqlDialect) ?? defaultSqlDialect,
        sqlDatasetId:
            typeof saved?.sqlDatasetId === "string" ? saved.sqlDatasetId : undefined,
        sqlSchemaSql:
            typeof saved?.sqlSchemaSql === "string" ? saved.sqlSchemaSql : undefined,
        sqlSeedSql:
            typeof saved?.sqlSeedSql === "string" ? saved.sqlSeedSql : undefined,
        sqlInitialTableSnapshots:
            saved?.sqlInitialTableSnapshots && typeof saved.sqlInitialTableSnapshots === "object"
                ? (saved.sqlInitialTableSnapshots as SqlTableSnapshots)
                : undefined,
        defaultSqlDialect,
    });

    const [toolLang, setToolLang0] = useState<WorkspaceLanguage>(initialLang);
    const [toolCode, setToolCode0] = useState<string>(initialCode);
    const [toolStdin, setToolStdin0] = useState<string>(initialStdin);
    const [toolWorkspace, setToolWorkspace0] = useState<WorkspaceStateV2 | null>(initialWorkspace);
    const [toolWorkspaceKey, setToolWorkspaceKey] = useState<string>(initialWorkspaceKey);
    const toolWorkspaceKeyRef = useRef(initialWorkspaceKey);

    const [toolSqlDialect, setToolSqlDialect0] =
        useState<SqlDialect>(initialResolvedSql.sqlDialect);
    const [toolSqlDatasetId, setToolSqlDatasetId0] =
        useState<string | undefined>(initialResolvedSql.sqlDatasetId);

    const [toolSqlSchemaSql, setToolSqlSchemaSql0] =
        useState<string | undefined>(initialResolvedSql.sqlSchemaSql);
    const [toolSqlSeedSql, setToolSqlSeedSql0] =
        useState<string | undefined>(initialResolvedSql.sqlSeedSql);
    const [toolSqlInitialTableSnapshots, setToolSqlInitialTableSnapshots0] =
        useState<SqlTableSnapshots | undefined>(initialResolvedSql.sqlInitialTableSnapshots);

    const [toolIdeConfig, setToolIdeConfig0] = useState<LearningIdeConfig | null>(null);
    const toolIdeConfigKeyRef = useRef<string>(ideConfigKey(null));
    const [hydratedToolIdentity, setHydratedToolIdentity] = useState<string>("");
    const toolHydrated = hydratedToolIdentity === toolIdentity;

    const setToolIdeConfigIfChanged = useCallback((config: LearningIdeConfig | null | undefined) => {
        const nextConfig = config ?? null;
        const nextKey = ideConfigKey(nextConfig);
        if (toolIdeConfigKeyRef.current === nextKey) return;
        toolIdeConfigKeyRef.current = nextKey;
        setToolIdeConfig0(nextConfig);
    }, []);

    useEffect(() => {
        if (effectiveBoundId == null) {
            setToolIdeConfigIfChanged(null);
        }
    }, [effectiveBoundId, setToolIdeConfigIfChanged]);

    const latestSnapRef = useRef<ToolSnap>({
        topicId: viewTid,
        toolKey: effectiveToolKey,
        lang: initialLang,
        code: initialCode,
        stdin: initialStdin,
        workspace: initialWorkspace,
        workspaceKey: initialWorkspaceKey,
        sqlDialect: initialResolvedSql.sqlDialect,
        sqlDatasetId: initialResolvedSql.sqlDatasetId,
        sqlSchemaSql: initialResolvedSql.sqlSchemaSql,
        sqlSeedSql: initialResolvedSql.sqlSeedSql,
        sqlInitialTableSnapshots: initialResolvedSql.sqlInitialTableSnapshots,
    });

    const toolSnap = useMemo<ToolSnap>(
        () => ({
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: toolLang,
            code: toolCode,
            stdin: toolStdin,
            workspace: toolWorkspace,
            workspaceKey: toolWorkspaceKey,
            sqlDialect: toolSqlDialect,
            sqlDatasetId: toolSqlDatasetId,
            sqlSchemaSql: toolSqlSchemaSql,
            sqlSeedSql: toolSqlSeedSql,
            sqlInitialTableSnapshots: toolSqlInitialTableSnapshots,
        }),
        [
            viewTid,
            effectiveToolKey,
            toolLang,
            toolCode,
            toolStdin,
            toolWorkspace,
            toolWorkspaceKey,
            toolSqlDialect,
            toolSqlDatasetId,
            toolSqlSchemaSql,
            toolSqlSeedSql,
            toolSqlInitialTableSnapshots,
        ],
    );

    const commitToolToProgress = useCallback(
        async (latest: ToolSnap) => {
            const topicId = latest.topicId;
            const toolKey = latest.toolKey;
            if (!topicId || !toolKey) return;
            if (isCardToolKey(toolKey)) return;
            const topicKey = normalizeTopicProgressKey(topicId);

            setProgress((p: any) => {
                const tp0: any = p?.topics?.[topicKey] ?? {};
                const prevToolState = tp0?.toolState?.[toolKey] ?? null;

                if (
                    prevToolState?.lang === latest.lang &&
                    prevToolState?.code === latest.code &&
                    prevToolState?.stdin === latest.stdin &&
                    workspaceKeyOf(prevToolState?.workspace ?? null) === latest.workspaceKey &&
                    prevToolState?.sqlDialect === latest.sqlDialect &&
                    prevToolState?.sqlDatasetId === latest.sqlDatasetId &&
                    prevToolState?.sqlSchemaSql === latest.sqlSchemaSql &&
                    prevToolState?.sqlSeedSql === latest.sqlSeedSql &&
                    JSON.stringify(prevToolState?.sqlInitialTableSnapshots ?? {}) ===
                    JSON.stringify(latest.sqlInitialTableSnapshots ?? {})
                ) {
                    return p;
                }

                const workspaceCode = deriveEntryCode(latest.workspace);



                const toolState = { ...(tp0.toolState ?? {}) };

                const nextToolEntry = {
                    lang: latest.lang,
                    code: workspaceCode || latest.code,
                    stdin: latest.stdin,
                    workspace: latest.workspace ?? null,
                    sqlDialect: latest.sqlDialect,
                    sqlDatasetId: latest.sqlDatasetId,
                    sqlSchemaSql: latest.sqlSchemaSql,
                    sqlSeedSql: latest.sqlSeedSql,
                    sqlInitialTableSnapshots: latest.sqlInitialTableSnapshots,
                };

                toolState[toolKey] = nextToolEntry;
                return {
                    ...p,
                    topics: {
                        ...(p?.topics ?? {}),
                        [topicKey]: { ...tp0, toolState },
                    },
                };
            });
        },
        [setProgress],
    );

    const flushToolSnapshot = useReviewRuntimeStore((s) => s.flushToolSnapshot);

    const { prime, flush, cancel } = useDebouncedCommit({
        value: toolSnap,
        enabled: progressHydrated && toolHydrated,
        delayMs: toolSaveDelayMs,
        serialize: snapKey,
        commit: async (latest) => {
            flushToolSnapshot();
            await commitToolToProgress(latest);
        },
    });

    const flushLatest = useCallback(async () => {
        cancel();

        const latest = latestSnapRef.current;
        if (!progressHydrated) return;
        if (`${latest.topicId}::${latest.toolKey}::${versionStr}` !== toolIdentity) return;

        prime(latest);
        flushToolSnapshot();
        await commitToolToProgress(latest);
    }, [cancel, prime, commitToolToProgress, progressHydrated, toolIdentity, versionStr, flushToolSnapshot]);

    useEffect(() => {
        if (progressHydrated) {
            void commitToolToProgress(latestSnapRef.current);
        }
        clearBoundState();
    }, [viewTid, scopeKey, progressHydrated, commitToolToProgress, clearBoundState]);

    const lastVersionRef = useRef<string | null>(null);

    useEffect(() => {
        if (!progressHydrated) return;

        if (lastVersionRef.current == null) {
            lastVersionRef.current = versionStr;
            return;
        }

        if (lastVersionRef.current !== versionStr) {
            void commitToolToProgress(latestSnapRef.current);
            clearBoundState();
        }

        lastVersionRef.current = versionStr;
    }, [progressHydrated, versionStr, clearBoundState]);

    useEffect(() => {
        if (!progressHydrated) return;
        if (boundRef.current) return;

        let s: any = null;
        if (effectiveBoundId) {
            const storeKey = resolveExerciseStoreKey(exercises, effectiveBoundId);
            s = storeKey ? exercises[storeKey] ?? null : null;
        } else {
            const cardKey = isCardToolKey(effectiveToolKey)
                ? cardStateKeyFromToolKey(effectiveToolKey)
                : null;

            const runtimeCards = useReviewRuntimeStore.getState().cards ?? {};
            const runtimeCard = cardKey
                ? runtimeCards[cardKey] ?? null
                : null;

            if (runtimeCard?.workspaceStatus === "ready" && runtimeCard?.toolWorkspace) {
                s = {
                    lang: runtimeCard.toolLang ?? defaultLang,
                    code: runtimeCard.toolCode ?? "",
                    stdin: runtimeCard.toolStdin ?? "",
                    workspace: runtimeCard.toolWorkspace,
                };
            }
        }
        /**
         * Important:
         * Even when there is no saved state for the current topic/tool yet,
         * we must still reset latestSnapRef to the CURRENT viewTid/effectiveToolKey.
         *
         * Otherwise edits in a new topic can be committed under the previous
         * topic/tool key, which makes refresh restore the starter code.
         */
        const nextLang = (s?.lang as WorkspaceLanguage) ?? defaultLang;

        const nextWorkspace =
            s?.workspace && typeof s.workspace === "object"
                ? (s.workspace as WorkspaceStateV2)
                : null;

        const nextCode = deriveEntryCode(nextWorkspace) || (typeof s?.code === "string" ? s.code : defaultCode);
        const nextStdin =
            typeof nextWorkspace?.stdin === "string"
                ? nextWorkspace.stdin
                : typeof s?.stdin === "string"
                    ? s.stdin
                    : defaultStdin;

        const resolvedSql = resolveSqlRunnerConfig({
            language: nextLang,
            sqlDialect: (s?.sqlDialect as SqlDialect) ?? defaultSqlDialect,
            sqlDatasetId:
                typeof s?.sqlDatasetId === "string" ? s.sqlDatasetId : undefined,
            sqlSchemaSql:
                typeof s?.sqlSchemaSql === "string" ? s.sqlSchemaSql : undefined,
            sqlSeedSql:
                typeof s?.sqlSeedSql === "string" ? s.sqlSeedSql : undefined,
            sqlInitialTableSnapshots:
                s?.sqlInitialTableSnapshots && typeof s.sqlInitialTableSnapshots === "object"
                    ? (s.sqlInitialTableSnapshots as SqlTableSnapshots)
                    : undefined,
            defaultSqlDialect,
        });

        const nextSnap: ToolSnap = {
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: nextLang,
            code: nextCode,
            stdin: nextStdin,
            workspace: nextWorkspace,
            workspaceKey: workspaceKeyOf(nextWorkspace),
            sqlDialect: resolvedSql.sqlDialect,
            sqlDatasetId: resolvedSql.sqlDatasetId,
            sqlSchemaSql: resolvedSql.sqlSchemaSql,
            sqlSeedSql: resolvedSql.sqlSeedSql,
            sqlInitialTableSnapshots: resolvedSql.sqlInitialTableSnapshots,
        };

        const latest = latestSnapRef.current;
        const latestIdentity = `${latest.topicId}::${latest.toolKey}::${versionStr}`;
        const hasUnsavedLocalEdits =
            hydratedToolIdentity === toolIdentity &&
            latestIdentity === toolIdentity &&
            snapKey(latest) !== snapKey(nextSnap);

        if (hasUnsavedLocalEdits) {
            return;
        }

        latestSnapRef.current = nextSnap;
        setHydratedToolIdentity(toolIdentity);

        setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
        setToolWorkspace0((prev) => (
            toolWorkspaceKeyRef.current === nextSnap.workspaceKey
                ? prev
                : (nextSnap.workspace ?? null)
        ));
        if (toolWorkspaceKeyRef.current !== nextSnap.workspaceKey) {
            toolWorkspaceKeyRef.current = nextSnap.workspaceKey;
            setToolWorkspaceKey(nextSnap.workspaceKey);
        }
        setToolSqlDialect0((prev) =>
            prev === nextSnap.sqlDialect ? prev : nextSnap.sqlDialect,
        );
        setToolSqlDatasetId0((prev) =>
            prev === nextSnap.sqlDatasetId ? prev : nextSnap.sqlDatasetId,
        );
        setToolSqlSchemaSql0((prev) =>
            prev === nextSnap.sqlSchemaSql ? prev : nextSnap.sqlSchemaSql,
        );
        setToolSqlSeedSql0((prev) =>
            prev === nextSnap.sqlSeedSql ? prev : nextSnap.sqlSeedSql,
        );
        setToolSqlInitialTableSnapshots0((prev) =>
            JSON.stringify(prev ?? {}) === JSON.stringify(nextSnap.sqlInitialTableSnapshots ?? {})
                ? prev
                : nextSnap.sqlInitialTableSnapshots,
        );

        prime(nextSnap);
    }, [
        viewTid,
        progressHydrated,
        versionStr,
        effectiveToolKey,
        toolIdentity,
        progress,
        defaultLang,
        defaultCode,
        defaultStdin,
        defaultSqlDialect,
        prime,
        hydratedToolIdentity,
        exercises,
        effectiveBoundId,
    ]);

    const bindCodeInput = useCallback(
        async (args2: {
            id: string;
            ownerCardId?: string | null;
            lang: WorkspaceLanguage;
            code: string;
            stdin?: string;
            ideConfig?: LearningIdeConfig | null;
            workspace?: WorkspaceStateV2 | null;
            sqlDialect?: SqlDialect;
            sqlDatasetId?: string;
            sqlSchemaSql?: string;
            sqlSeedSql?: string;
            sqlInitialTableSnapshots?: SqlTableSnapshots;
            exerciseKey?: string;
            preferSnapshot?: boolean;
            onPatch: (patch: any) => void;
        }) => {
            if (boundRef.current && boundRef.current.id !== args2.id) {
                await flushLatest();
            }
            const resolvedSql = resolveSqlRunnerConfig({
                language: args2.lang,
                sqlDialect: args2.sqlDialect ?? defaultSqlDialect,
                sqlDatasetId: args2.sqlDatasetId,
                sqlSchemaSql: args2.sqlSchemaSql,
                sqlSeedSql: args2.sqlSeedSql,
                sqlInitialTableSnapshots: args2.sqlInitialTableSnapshots,
                defaultSqlDialect,
            });

            const inputId = args2.id;
            const targetKey = resolveExerciseStoreKey(
                exercises,
                inputId,
                args2.exerciseKey ?? null,
            ) ?? inputId;

            const nextWorkspace = args2.workspace ?? null;
            const nextToolKey = `exercise:${targetKey}`;
            const nextIdentity = `${viewTid}::${nextToolKey}::${versionStr}`;
            const snapshotOverridesSaved = args2.preferSnapshot === true;
            const savedForBind =
                snapshotOverridesSaved
                    ? null
                    : exercises[targetKey] ??
                      ((getTopicProgressState((progress as any)?.topics ?? {}, viewTid).topic as any)?.toolState?.[nextToolKey] ??
                      null);
            const savedWorkspace =
                savedForBind?.workspace && typeof savedForBind.workspace === "object"
                    ? (savedForBind.workspace as WorkspaceStateV2)
                    : null;

            const savedWorkspaceCode = deriveEntryCode(savedWorkspace);
            const incomingWorkspaceCode = deriveEntryCode(nextWorkspace);

            /**
             * Important:
             * A stale saved workspace can exist with an empty entry file from an old
             * bad bind/general scope. Do not let that blank workspace override the
             * current exercise's nonblank workspace.
             */
            const shouldUseSavedWorkspace =
                !!savedWorkspace &&
                !(
                    String(savedWorkspaceCode ?? "").trim() === "" &&
                    String(incomingWorkspaceCode ?? "").trim() !== ""
                );

            const workspaceForBind = shouldUseSavedWorkspace
                ? savedWorkspace
                : nextWorkspace;

            const workspaceForBindCode = deriveEntryCode(workspaceForBind);

            const nextSnap: ToolSnap = {
                topicId: viewTid,
                toolKey: nextToolKey,
                lang: (savedForBind?.language as WorkspaceLanguage) ?? args2.lang,
                code:
                    workspaceForBindCode ||
                    (typeof savedForBind?.code === "string" && savedForBind.code.trim() !== ""
                        ? savedForBind.code
                        : "") ||
                    (typeof args2.code === "string" ? args2.code : ""),
                stdin:
                    typeof workspaceForBind?.stdin === "string"
                        ? workspaceForBind.stdin
                        : typeof savedForBind?.stdin === "string"
                            ? savedForBind.stdin
                            : typeof args2.stdin === "string"
                                ? args2.stdin
                                : "",
                workspace: workspaceForBind,
                workspaceKey: workspaceKeyOf(workspaceForBind),
                sqlDialect:
                    (savedForBind as any)?.sqlDialect ??
                    (savedForBind?.workspace as any)?.sqlDialect ??
                    resolvedSql.sqlDialect,
                sqlDatasetId: firstNonBlank(
                    (savedForBind as any)?.sqlDatasetId,
                    (savedForBind?.workspace as any)?.sqlDatasetId,
                    resolvedSql.sqlDatasetId,
                ),
                sqlSchemaSql: firstNonBlank(
                    (savedForBind as any)?.sqlSchemaSql,
                    (savedForBind?.workspace as any)?.sqlSchemaSql,
                    resolvedSql.sqlSchemaSql,
                ),
                sqlSeedSql: firstNonBlank(
                    (savedForBind as any)?.sqlSeedSql,
                    (savedForBind?.workspace as any)?.sqlSeedSql,
                    resolvedSql.sqlSeedSql,
                ),
                sqlInitialTableSnapshots:
                    (savedForBind as any)?.sqlInitialTableSnapshots ??
                    (savedForBind?.workspace as any)?.sqlInitialTableSnapshots ??
                    resolvedSql.sqlInitialTableSnapshots,
            };

            if (
                savedForBind &&
                (nextSnap.code !== args2.code ||
                    nextSnap.stdin !== (args2.stdin ?? "") ||
                    nextSnap.lang !== args2.lang)
            ) {
                args2.onPatch({
                    codeLang: nextSnap.lang,
                    code: nextSnap.code,
                    codeStdin: nextSnap.stdin,
                    submitted: false,
                    result: null,
                });
            }

            const nextBindKey = `${nextIdentity}::${inputId}::${targetKey}::${snapKey(nextSnap)}::${ideConfigKey(args2.ideConfig)}`;

            if (lastBindKeyRef.current === nextBindKey) {
                boundRef.current = { id: inputId, exerciseKey: targetKey, onPatch: args2.onPatch };
                boundContextRef.current = bindingContext;
                setToolIdeConfigIfChanged(args2.ideConfig ?? null);
                if (hydratedToolIdentity !== nextIdentity) setHydratedToolIdentity(nextIdentity);
                return;
            }

            lastBindKeyRef.current = nextBindKey;
            boundRef.current = { id: inputId, exerciseKey: targetKey, onPatch: args2.onPatch };
            boundContextRef.current = bindingContext;
            setBoundId((prev) => (prev === targetKey ? prev : targetKey));
            setToolIdeConfigIfChanged(args2.ideConfig ?? null);

            boundDirtyRef.current = false;
            latestSnapRef.current = nextSnap;
            setHydratedToolIdentity(nextIdentity);

            setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
            setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
            setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
            setToolWorkspace0((prev) => (
                toolWorkspaceKeyRef.current === nextSnap.workspaceKey
                    ? prev
                    : (nextSnap.workspace ?? null)
            ));
            if (toolWorkspaceKeyRef.current !== nextSnap.workspaceKey) {
                toolWorkspaceKeyRef.current = nextSnap.workspaceKey;
                setToolWorkspaceKey(nextSnap.workspaceKey);
            }
            setToolSqlDialect0((prev) =>
                prev === nextSnap.sqlDialect ? prev : nextSnap.sqlDialect,
            );
            setToolSqlDatasetId0((prev) =>
                prev === nextSnap.sqlDatasetId ? prev : nextSnap.sqlDatasetId,
            );
            setToolSqlSchemaSql0((prev) =>
                prev === nextSnap.sqlSchemaSql ? prev : nextSnap.sqlSchemaSql,
            );
            setToolSqlSeedSql0((prev) =>
                prev === nextSnap.sqlSeedSql ? prev : nextSnap.sqlSeedSql,
            );
            setToolSqlInitialTableSnapshots0((prev) =>
                JSON.stringify(prev ?? {}) === JSON.stringify(nextSnap.sqlInitialTableSnapshots ?? {})
                    ? prev
                    : nextSnap.sqlInitialTableSnapshots,
            );

            if (snapshotOverridesSaved) {
                void commitToolToProgress(nextSnap);
            } else {
                prime(nextSnap);
            }
        },
        [
            prime,
            commitToolToProgress,
            defaultSqlDialect,
            setToolIdeConfigIfChanged,
            bindingContext,
            viewTid,
            versionStr,
            hydratedToolIdentity,
            progress,
            exercises,
            flushLatest,
        ],
    );

    const unbindCodeInput = useCallback(() => {
        if (progressHydrated) {
            void commitToolToProgress(latestSnapRef.current);
        }
        cancel();
        clearBoundState();
        setToolIdeConfigIfChanged(null);
    }, [
        cancel,
        clearBoundState,
        setToolIdeConfigIfChanged,
        progressHydrated,
        commitToolToProgress,
    ]);

    useFlushOnPageExit(() => {
        cancel();
        void flushLatest();
    }, progressHydrated);

    useEffect(() => {
        return () => {
            cancel();
            const latest = latestSnapRef.current;
            if (
                progressHydrated &&
                toolHydrated &&
                `${latest.topicId}::${latest.toolKey}::${versionStr}` === toolIdentity
            ) {
                void commitToolToProgress(latest);
            }
        };
    }, [toolIdentity, versionStr, progressHydrated, toolHydrated, cancel, commitToolToProgress]);

    useEffect(() => {
        return () => {
            cancel();
            void flushLatest();
        };
    }, [cancel, flushLatest]);

    const setToolLang = useCallback((l: WorkspaceLanguage) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: l,
        };
        setToolLang0((prev) => (prev === l ? prev : l));

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            const latest = latestSnapRef.current;

            reviewSaveDebug("bound exercise tool patch", () => ({
                boundId: b.id,
                exerciseKey: b.exerciseKey,
                effectiveBoundId,
                codeLength: String(latest.code ?? "").length,
                stdinLength: String(latest.stdin ?? "").length,
                workspace: summarizeWorkspaceForSave(latest.workspace),
            }));

            b.onPatch({ codeLang: l, submitted: false, result: null });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey]);

    const setToolCode = useCallback((c: string) => {
        const currentWorkspace = latestSnapRef.current.workspace ?? null;
        const nextWorkspace = workspaceWithEntryCode(currentWorkspace, c);
        const nextWorkspaceKey = workspaceKeyOf(nextWorkspace);

        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            code: c,
            workspace: nextWorkspace,
            workspaceKey: nextWorkspaceKey,
        };

        setToolCode0((prev) => (prev === c ? prev : c));
        if (toolWorkspaceKeyRef.current !== nextWorkspaceKey) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(nextWorkspace);
            setToolWorkspaceKey(nextWorkspaceKey);
        }

        if (isCardToolKey(effectiveToolKey)) {
            const cardKey = cardStateKeyFromToolKey(effectiveToolKey);
            const cardId = cardIdFromToolKey(effectiveToolKey);

            patchCard(cardKey, {
                topicId: viewTid,
                cardId,
                toolKey: effectiveToolKey,
                toolWorkspace: nextWorkspace,
                toolCode: c,
                toolStdin: latestSnapRef.current.stdin,
                toolLang: latestSnapRef.current.lang,
                workspaceStatus: nextWorkspace ? "ready" : "pending",
                workspaceSeedMode: nextWorkspace ? "restored" : undefined,
                workspaceOrigin: "user",
                userEdited: true,
            } as any);
        }

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                ...(nextWorkspace
                    ? {
                        workspace: nextWorkspace,
                        codeWorkspace: nextWorkspace,
                        ideWorkspace: nextWorkspace,
                    }
                    : {}),
                code: c,
                submitted: false,
                result: null,
                userEdited: true,
                workspaceOrigin: "user",
            });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey, patchCard]);

    const setToolStdin = useCallback((s: string) => {
        const currentWorkspace = latestSnapRef.current.workspace ?? null;
        const nextWorkspace =
            currentWorkspace && currentWorkspace.version === 2
                ? { ...currentWorkspace, stdin: s }
                : currentWorkspace;
        const nextWorkspaceKey = workspaceKeyOf(nextWorkspace);

        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            stdin: s,
            workspace: nextWorkspace,
            workspaceKey: nextWorkspaceKey,
        };

        setToolStdin0((prev) => (prev === s ? prev : s));
        if (toolWorkspaceKeyRef.current !== nextWorkspaceKey) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(nextWorkspace);
            setToolWorkspaceKey(nextWorkspaceKey);
        }

        if (isCardToolKey(effectiveToolKey)) {
            const cardKey = cardStateKeyFromToolKey(effectiveToolKey);
            const cardId = cardIdFromToolKey(effectiveToolKey);

            patchCard(cardKey, {
                topicId: viewTid,
                cardId,
                toolKey: effectiveToolKey,
                toolWorkspace: nextWorkspace,
                toolCode: latestSnapRef.current.code,
                toolStdin: s,
                toolLang: latestSnapRef.current.lang,
                workspaceStatus: nextWorkspace ? "ready" : "pending",
                workspaceSeedMode: nextWorkspace ? "restored" : undefined,
                workspaceOrigin: "user",
                userEdited: true,
            } as any);
        }

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                ...(nextWorkspace
                    ? {
                        workspace: nextWorkspace,
                        codeWorkspace: nextWorkspace,
                        ideWorkspace: nextWorkspace,
                    }
                    : {}),
                codeStdin: s,
                stdin: s,
                submitted: false,
                result: null,
                userEdited: true,
                workspaceOrigin: "user",
            });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey, patchCard]);

    const setToolWorkspace = useCallback((workspace: WorkspaceStateV2 | null) => {
        const nextWorkspaceKey = workspaceKeyOf(workspace);
        const workspaceCode = deriveEntryCode(workspace);
        const workspaceStdin =
            typeof workspace?.stdin === "string"
                ? workspace.stdin
                : latestSnapRef.current.stdin;

        const nextSnap = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            code: workspaceCode || latestSnapRef.current.code,
            stdin: workspaceStdin,
            workspace,
            workspaceKey: nextWorkspaceKey,
        };

        latestSnapRef.current = nextSnap;

        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));

        const workspaceChanged = toolWorkspaceKeyRef.current !== nextWorkspaceKey;

        if (workspaceChanged) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(workspace);
            setToolWorkspaceKey(nextWorkspaceKey);
        }

        /**
         * Critical:
         * Workspace edits from FullIDE must be written into progress.
         * Otherwise navigation works in-memory, but refresh restores old DB state.
         */
        if (isCardToolKey(effectiveToolKey)) {
            const cardKey = cardStateKeyFromToolKey(effectiveToolKey);
            const cardId = cardIdFromToolKey(effectiveToolKey);
            const existingCard = useReviewRuntimeStore.getState().cards?.[cardKey] ?? null;

            const cardAlreadyMatches = Boolean(
                existingCard &&
                    workspaceKeyOf(existingCard.toolWorkspace ?? null) === nextWorkspaceKey &&
                    String(existingCard.toolCode ?? "") === String(nextSnap.code ?? "") &&
                    String(existingCard.toolStdin ?? "") === String(nextSnap.stdin ?? "") &&
                    String(existingCard.toolLang ?? "") === String(nextSnap.lang ?? ""),
            );

            if (!cardAlreadyMatches) {
                reviewSaveDebug("card tool editor changed", () => ({
                    topicId: viewTid,
                    cardId,
                    cardKey,
                    effectiveToolKey,
                    codeLength: String(nextSnap.code ?? "").length,
                    stdinLength: String(nextSnap.stdin ?? "").length,
                    workspace: summarizeWorkspaceForSave(workspace),
                }));

                patchCard(cardKey, {
                    topicId: viewTid,
                    cardId,
                    toolKey: effectiveToolKey,
                    toolWorkspace: workspace,
                    toolCode: nextSnap.code,
                    toolStdin: nextSnap.stdin,
                    toolLang: nextSnap.lang,
                    workspaceStatus: workspace ? "ready" : "pending",
                    workspaceSeedMode: workspace ? "restored" : undefined,
                    workspaceOrigin: "user",
                    userEdited: true,
                } as any);
            }
        }

        if (progressHydrated) {
            prime(nextSnap);
            void commitToolToProgress(nextSnap);
        }

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
                code: nextSnap.code,
                codeStdin: nextSnap.stdin,
                stdin: nextSnap.stdin,
                submitted: false,
                result: null,
                userEdited: true,
                workspaceOrigin: "user",
            });
        }
    }, [
        bindingContext,
        commitToolToProgress,
        patchCard,
        effectiveBoundId,
        effectiveToolKey,
        prime,
        progressHydrated,
        viewTid,
    ]);

    const setToolSqlDialect = useCallback((d: SqlDialect) => {
        latestSnapRef.current = { ...latestSnapRef.current, sqlDialect: d };
        setToolSqlDialect0((prev) => (prev === d ? prev : d));

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({ codeSqlDialect: d, submitted: false, result: null });
        }
    }, [effectiveBoundId, bindingContext]);

    const resolvedSql = useMemo(() => {
        return resolveSqlRunnerConfig({
            language: toolLang,
            sqlDialect: toolSqlDialect,
            sqlDatasetId: toolSqlDatasetId,
            sqlSchemaSql: toolSqlSchemaSql,
            sqlSeedSql: toolSqlSeedSql,
            sqlInitialTableSnapshots: toolSqlInitialTableSnapshots,
            defaultSqlDialect,
        });
    }, [
        toolLang,
        toolSqlDialect,
        toolSqlDatasetId,
        toolSqlSchemaSql,
        toolSqlSeedSql,
        toolSqlInitialTableSnapshots,
        defaultSqlDialect,
    ]);

    const rightBodyRef = useRef<HTMLDivElement | null>(null);
    const [rightBodyH, setRightBodyH] = useState(520);

    useEffect(() => {
        if (rightCollapsed) return;

        const el = rightBodyRef.current;
        if (!el) return;

        let raf = 0;
        const update = () => {
            if (raf) window.cancelAnimationFrame(raf);
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                const next = Math.max(280, el.clientHeight - 100 || 520);
                setRightBodyH((prev) => (Math.abs(prev - next) < 1 ? prev : next));
            });
        };
        update();

        if (typeof ResizeObserver === "undefined") {
            return () => {
                if (raf) window.cancelAnimationFrame(raf);
            };
        }

        const ro = new ResizeObserver(() => update());
        ro.observe(el);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [rightCollapsed, rightW]);

    const codeRunnerRegionH = Math.max(280, rightBodyH);
    const displayHydrated = toolHydrated;

    return {
        boundId: effectiveBoundId,
        isBound,
        bindCodeInput,
        unbindCodeInput,
        toolHydrated: displayHydrated,

        toolLang: displayHydrated ? toolLang : initialLang,
        toolCode: displayHydrated ? toolCode : initialCode,
        toolStdin: displayHydrated ? toolStdin : initialStdin,
        toolWorkspace: displayHydrated ? toolWorkspace : initialWorkspace,

        toolSqlDialect: displayHydrated ? resolvedSql.sqlDialect : initialResolvedSql.sqlDialect,
        toolSqlDatasetId: displayHydrated ? toolSqlDatasetId : initialResolvedSql.sqlDatasetId,
        toolSqlSchemaSql: displayHydrated
            ? resolvedSql.sqlSchemaSql
            : initialResolvedSql.sqlSchemaSql,
        toolSqlSeedSql: displayHydrated
            ? resolvedSql.sqlSeedSql
            : initialResolvedSql.sqlSeedSql,
        toolSqlInitialTableSnapshots: displayHydrated
            ? resolvedSql.sqlInitialTableSnapshots
            : initialResolvedSql.sqlInitialTableSnapshots,
        toolIdeConfig,

        setToolLang,
        setToolCode,
        setToolStdin,
        setToolWorkspace,
        setToolSqlDialect,

        rightBodyRef,
        codeRunnerRegionH,

        flush,
        flushLatest,
    };
}
