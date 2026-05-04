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
    return JSON.stringify(workspace ?? null);
}
function workspaceHasFiles(workspace: WorkspaceStateV2 | null | undefined) {
    return !!workspace?.nodes?.some((node: any) => node?.kind === "file");
}

function workspaceHasNonBlankCode(workspace: WorkspaceStateV2 | null | undefined) {
    return !!workspace?.nodes?.some((node: any) => {
        return (
            node?.kind === "file" &&
            typeof node?.content === "string" &&
            node.content.trim() !== ""
        );
    });
}

function workspaceHasStarterSignature(workspace: WorkspaceStateV2 | null | undefined) {
    return !!workspace && typeof (workspace as any).starterSignature === "string";
}

const CARD_STARTER_SCHEMA_VERSION = 12;

function workspaceCardStarterSchemaVersion(workspace: WorkspaceStateV2 | null | undefined) {
    return workspace && typeof (workspace as any).cardStarterSchemaVersion === "number"
        ? Number((workspace as any).cardStarterSchemaVersion)
        : 0;
}

function workspaceCardStarterSourceKey(workspace: WorkspaceStateV2 | null | undefined) {
    return workspace && typeof (workspace as any).cardStarterSourceKey === "string"
        ? String((workspace as any).cardStarterSourceKey)
        : null;
}

function workspaceFileCount(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return 0;
    }

    return workspace.nodes.filter((node: any) => node?.kind === "file").length;
}

function attachRuntimeCardStarterMetadata(args: {
    incoming: WorkspaceStateV2 | null;
    runtimeWorkspace: WorkspaceStateV2 | null | undefined;
}) {
    const { incoming, runtimeWorkspace } = args;

    if (!incoming || incoming.version !== 2) return incoming;

    const runtimeSourceKey = workspaceCardStarterSourceKey(runtimeWorkspace);
    const runtimeSchema = workspaceCardStarterSchemaVersion(runtimeWorkspace);

    if (!runtimeSourceKey || runtimeSchema < CARD_STARTER_SCHEMA_VERSION) {
        return incoming;
    }

    return {
        ...incoming,
        cardStarterSchemaVersion: runtimeSchema,
        cardStarterSourceKey: runtimeSourceKey,
        cardStarterOwnerKey: (runtimeWorkspace as any)?.cardStarterOwnerKey ?? null,
        cardStarterSignature: (runtimeWorkspace as any)?.cardStarterSignature ?? null,
        cardStarterBaseFileSignature:
            (runtimeWorkspace as any)?.cardStarterBaseFileSignature ?? null,
        cardStarterManifestKey: (runtimeWorkspace as any)?.cardStarterManifestKey ?? null,
    } as WorkspaceStateV2;
}

function shouldIgnoreIncomingCardWorkspace(args: {
    incoming: WorkspaceStateV2 | null;
    runtimeWorkspace: WorkspaceStateV2 | null | undefined;
    currentWorkspace?: WorkspaceStateV2 | null;
}) {
    const { incoming, runtimeWorkspace, currentWorkspace } = args;

    const incomingCount = workspaceFileCount(incoming);
    const protectedCount = Math.max(
        workspaceFileCount(runtimeWorkspace),
        workspaceFileCount(currentWorkspace),
    );

    /**
     * Strong guard:
     * If the active card workspace currently has multiple files, reject a
     * smaller incoming workspace even when metadata is missing/stripped.
     */
    if (protectedCount > 1 && incomingCount < protectedCount) {
        return true;
    }

    const runtimeSourceKey = workspaceCardStarterSourceKey(runtimeWorkspace);
    const runtimeSchema = workspaceCardStarterSchemaVersion(runtimeWorkspace);

    if (!runtimeSourceKey || runtimeSchema < CARD_STARTER_SCHEMA_VERSION) {
        return false;
    }

    const incomingSourceKey = workspaceCardStarterSourceKey(incoming);
    const incomingSchema = workspaceCardStarterSchemaVersion(incoming);

    if (!incomingSourceKey || incomingSchema < CARD_STARTER_SCHEMA_VERSION) {
        const runtimeCount = workspaceFileCount(runtimeWorkspace);
        return runtimeCount > 1 && incomingCount < runtimeCount;
    }

    return incomingSourceKey !== runtimeSourceKey;
}
function latestSnapIsBlankCardDefault(snap: ToolSnap) {
    return (
        isCardToolKey(snap.toolKey) &&
        !workspaceHasNonBlankCode(snap.workspace) &&
        String(snap.code ?? "").trim() === "" &&
        String(snap.stdin ?? "").trim() === ""
    );
}

function nextSnapIsRuntimeStarterWorkspace(snap: ToolSnap) {
    return (
        isCardToolKey(snap.toolKey) &&
        !!snap.workspace &&
        (
            workspaceHasStarterSignature(snap.workspace) ||
            workspaceHasFiles(snap.workspace) ||
            workspaceHasNonBlankCode(snap.workspace)
        )
    );
}
function ideConfigKey(config: LearningIdeConfig | null | undefined) {
    return JSON.stringify(config ?? null);
}


function resolveExerciseStoreKey(
    exercises: Record<string, any>,
    inputId: string | null | undefined,
    explicitExerciseKey?: string | null,
) {
    if (explicitExerciseKey && exercises[explicitExerciseKey]) return explicitExerciseKey;
    if (explicitExerciseKey) return explicitExerciseKey;

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

function isExerciseToolKey(toolKey: string | null | undefined) {
    return typeof toolKey === "string" && toolKey.startsWith("exercise:");
}

function isCardToolKey(toolKey: string | null | undefined) {
    if (typeof toolKey !== "string" || !toolKey.trim()) return false;
    if (isExerciseToolKey(toolKey)) return false;
    return toolKey.endsWith(":general");
}

function cardIdFromToolKey(toolKey: string) {
    const parts = toolKey.split(":").filter(Boolean);

    if (parts.length >= 2 && parts[parts.length - 1] === "general") {
        return parts[parts.length - 2];
    }

    return toolKey;
}

function canonicalCardKeyFromToolKey(toolKey: string) {
    if (!toolKey.endsWith(":general")) return null;

    const parts = toolKey.split(":").filter(Boolean);
    if (parts.length < 2) return null;

    return parts.slice(0, -1).join(":");
}

function findRuntimeCardEntryForCard(args: {
    cards: Record<string, any>;
    effectiveToolKey: string;
}) {
    const canonicalCardKey = canonicalCardKeyFromToolKey(args.effectiveToolKey);

    if (!canonicalCardKey) return null;

    const card = args.cards?.[canonicalCardKey] ?? null;
    return card ? ([canonicalCardKey, card] as [string, any]) : null;
}


function writeCardToolWorkspaceBackup(_args: {
    topicId: string;
    toolKey: string;
    snap: {
        lang?: string;
        code?: string;
        stdin?: string;
        workspace?: WorkspaceStateV2 | null;
    };
}) {
    /**
     * Disabled.
     *
     * Card/sketch workspaces are now owned by reviewRuntimeStore.cards.
     * Local backup aliases are unsafe because they can restore stale workspace
     * files under another sketch card.
     */
}


function starterToolDebug(label: string, payload: Record<string, any>) {
    if (typeof window === "undefined") return;

    const enabled = window.localStorage.getItem("zoe:debug:starter-files") === "1";

    if (!enabled) return;

    console.groupCollapsed(`[starter-files] tool:${label}`);
    console.log(payload);
    console.groupEnd();
}

function cardWorkspaceSemanticKey(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const nodeById = new Map(
        workspace.nodes.map((node: any) => [String(node?.id ?? ""), node]),
    );

    const pathOf = (node: any) => {
        if (!node) return "";

        const parts: string[] = [];
        let current = node;
        let guard = 0;

        while (current && guard < 200) {
            if (typeof current.name === "string" && current.name) {
                parts.unshift(current.name);
            }

            if (!current.parentId) break;
            current = nodeById.get(String(current.parentId ?? "")) ?? null;
            guard += 1;
        }

        return parts.join("/");
    };

    const files = workspace.nodes
        .filter((node: any) => node?.kind === "file")
        .map((node: any) => ({
            path: pathOf(node),
            content: String(node.content ?? ""),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

    const entryPath =
        workspace.nodes.find((node: any) => node?.kind === "file" && node.id === workspace.entryFileId) ??
        null;
    const activePath =
        workspace.nodes.find((node: any) => node?.kind === "file" && node.id === workspace.activeFileId) ??
        null;

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        entryFilePath: pathOf(entryPath),
        activeFilePath: pathOf(activePath),
        files,
    });
}

function workspaceStateKeyForTool(args: {
    toolKey: string;
    workspace: WorkspaceStateV2 | null | undefined;
}) {
    return isCardToolKey(args.toolKey)
        ? cardWorkspaceSemanticKey(args.workspace)
        : workspaceKeyOf(args.workspace);
}

function debugWorkspaceSummary(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return {
            isWorkspace: false,
            fileCount: 0,
            files: [],
            entryFileId: null,
            activeFileId: null,
            stdin: null,
            starterSignature: null,
        };
    }

    return {
        isWorkspace: true,
        fileCount: workspace.nodes.filter((node: any) => node.kind === "file").length,
        files: workspace.nodes
            .filter((node: any) => node.kind === "file")
            .map((node: any) => ({
                id: node.id,
                name: node.name,
                parentId: node.parentId,
                contentPreview: String(node.content ?? "").slice(0, 80),
                contentLength: String(node.content ?? "").length,
            })),
        entryFileId: workspace.entryFileId,
        activeFileId: workspace.activeFileId,
        stdin: workspace.stdin,
        starterSignature: (workspace as any).starterSignature ?? null,
    };
}

function readCardToolWorkspaceBackup(
    _topicId: string,
    _toolKey: string,
) {
    /**
     * Disabled.
     *
     * Runtime card state is the only workspace source of truth.
     */
    return null;
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
        scopeKey = "general",
        defaultLang = "python",
        defaultCode = `print("Hello World!")`,
        defaultStdin = "",
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
        rightCollapsed,
        rightW,
        toolSaveDelayMs = 700,
    } = args;

    const exercises = useReviewRuntimeStore((s) => s.exercises);
    const runtimeCards = useReviewRuntimeStore((s) => s.cards);
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
        if (effectiveBoundId) {
            const storeKey = resolveExerciseStoreKey(exercises, effectiveBoundId);
            const found = storeKey ? exercises[storeKey] ?? null : null;
            if (found) return found;

            if (effectiveBoundId.includes(":")) return null;
        }

        /**
         * Bomb-wipe rule:
         *
         * Card/sketch tools do NOT hydrate from progress.topics[tid].toolState.
         * That legacy path stores loose aliases and stale workspaces, which is
         * exactly how sketch0 files leak into sketch1/2/3.
         *
         * Card/sketch source of truth is only:
         *   reviewRuntimeStore.cards[canonicalCardKey].toolWorkspace
         */
        if (isCardToolKey(effectiveToolKey)) {
            return null;
        }

        return (progress as any)?.topics?.[viewTid]?.toolState?.[effectiveToolKey] ?? null;
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
    const initialWorkspaceKey = workspaceStateKeyForTool({
        toolKey: effectiveToolKey,
        workspace: initialWorkspace,
    });

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

            const workspaceCode = deriveEntryCode(latest.workspace);

            /**
             * Bomb-wipe rule:
             *
             * Card/sketch workspaces are persisted only into the runtime card
             * store. Do NOT mirror them into progress.toolState and do NOT write
             * `card:${cardId}` aliases.
             *
             * This gives sketch cards the same clean ownership model as exercises:
             *
             *   canonicalCardKey -> card.toolWorkspace
             */
            if (isCardToolKey(toolKey)) {
                /**
                 * ONE-SOURCE RULE:
                 *
                 * Card/sketch tools do not write progress.toolState here and do
                 * not do a second runtime patch here.
                 *
                 * The only writer is setToolWorkspace -> patchCard(canonicalKey).
                 */
                return;
            }

            setProgress((p: any) => {
                const tp0: any = p?.topics?.[topicId] ?? {};
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

                const toolState = { ...(tp0.toolState ?? {}) };

                toolState[toolKey] = {
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

                return {
                    ...p,
                    topics: {
                        ...(p?.topics ?? {}),
                        [topicId]: { ...tp0, toolState },
                    },
                };
            });
        },
        [setProgress, patchCard],
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
            const canonicalCardKey = canonicalCardKeyFromToolKey(effectiveToolKey);
            const cardId = canonicalCardKey
                ? cardIdFromToolKey(effectiveToolKey)
                : null;
            const runtimeCardEntry = canonicalCardKey
                ? findRuntimeCardEntryForCard({
                    cards: runtimeCards ?? {},
                    effectiveToolKey,
                })
                : null;

            const runtimeCard = runtimeCardEntry?.[1] ?? null;

            const enabled =
                typeof window !== "undefined" &&
                window.localStorage.getItem("zoe:debug:starter-files") === "1";

            if (enabled) {
                console.groupCollapsed(`[starter-files] useToolCodeRunnerState hydrate: ${effectiveToolKey}`);
                console.log({
                    effectiveToolKey,
                    canonicalCardKey,
                    cardId,
                    runtimeCardEntryKey: runtimeCardEntry?.[0] ?? null,
                    runtimeCardFiles: runtimeCard?.toolWorkspace ? workspaceFileCount(runtimeCard.toolWorkspace) : 0,
                    runtimeCard: runtimeCard ? {
                        cardKey: runtimeCard.cardKey,
                        toolWorkspace: debugWorkspaceSummary(runtimeCard.toolWorkspace),
                    } : null,
                });
                console.groupEnd();
            }

            if (runtimeCard?.toolWorkspace) {
                const workspaceCode = deriveEntryCode(runtimeCard.toolWorkspace);

                s = {
                    lang:
                        runtimeCard.toolLang ??
                        runtimeCard.toolWorkspace?.language ??
                        defaultLang,
                    code:
                        workspaceCode ?? "",
                    stdin:
                        typeof runtimeCard.toolWorkspace?.stdin === "string"
                            ? runtimeCard.toolWorkspace.stdin
                            : runtimeCard.toolStdin ?? defaultStdin,
                    workspace: runtimeCard.toolWorkspace,
                };
            } else {
                s = null;

                starterToolDebug("hydrate-card-fallback-disabled", {
                    viewTid,
                    effectiveToolKey,
                    canonicalCardKey,
                    cardId,
                    chosen: null,
                });
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

        const nextCode = isCardToolKey(effectiveToolKey)
            ? (deriveEntryCode(nextWorkspace) ?? "")
            : (deriveEntryCode(nextWorkspace) || (typeof s?.code === "string" ? s.code : defaultCode));
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
            workspaceKey: workspaceStateKeyForTool({
                toolKey: effectiveToolKey,
                workspace: nextWorkspace,
            }),
            sqlDialect: resolvedSql.sqlDialect,
            sqlDatasetId: resolvedSql.sqlDatasetId,
            sqlSchemaSql: resolvedSql.sqlSchemaSql,
            sqlSeedSql: resolvedSql.sqlSeedSql,
            sqlInitialTableSnapshots: resolvedSql.sqlInitialTableSnapshots,
        };

        if (isCardToolKey(effectiveToolKey) && !nextWorkspace) {
            /**
             * Card/sketch with no starter/runtime workspace:
             *
             * This is a valid hydrated-empty state. Mark it hydrated so
             * CodeToolPane can render the blank/default editor instead of
             * staying forever on "Loading sketch workspace...".
             */
            latestSnapRef.current = nextSnap;
            setHydratedToolIdentity(toolIdentity);
            setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
            setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
            setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
            setToolWorkspace0((prev) => (prev === null ? prev : null));
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

            starterToolDebug("hydrate-card-empty-apply", {
                viewTid,
                effectiveToolKey,
                toolIdentity,
                nextSnap: {
                    lang: nextSnap.lang,
                    code: nextSnap.code,
                    stdin: nextSnap.stdin,
                    workspace: debugWorkspaceSummary(nextSnap.workspace),
                },
            });

            return;
        }

        const latest = latestSnapRef.current;

        const sameLiveTool =
            hydratedToolIdentity === toolIdentity &&
            latest.topicId === viewTid &&
            latest.toolKey === effectiveToolKey;

        const changedSnap = snapKey(latest) !== snapKey(nextSnap);

        const latestCode = String(latest.code ?? "").trim();
        const latestWorkspaceCode = String(deriveEntryCode(latest.workspace) ?? "").trim();
        const defaultCodeTrimmed = String(defaultCode ?? "").trim();

        /**
         * Sketch/card starter workspace case:
         *
         * A sketch/card tool can hydrate first with the generic default editor state
         * before ensureCard finishes resolving sketch.workspace.starterFiles.
         *
         * That generic default may be blank, or it may be something like:
         *
         *   print("Hello World!")
         *
         * If the current card state still looks like that default state, allow the
         * runtime card starter workspace to replace it.
         *
         * If the learner typed real code, block the replacement.
         */
        const latestLooksLikeReplaceableCardDefault =
            isCardToolKey(latest.toolKey) &&
            !workspaceHasStarterSignature(latest.workspace) &&
            (
                latestCode === "" ||
                latestCode === defaultCodeTrimmed ||
                latestWorkspaceCode === "" ||
                latestWorkspaceCode === defaultCodeTrimmed
            );

        const nextWorkspaceSchemaVersion =
            workspaceCardStarterSchemaVersion(nextSnap.workspace);

        const latestWorkspaceSchemaVersion =
            workspaceCardStarterSchemaVersion(latest.workspace);

        const nextWorkspaceSourceKey =
            workspaceCardStarterSourceKey(nextSnap.workspace);

        const latestWorkspaceSourceKey =
            workspaceCardStarterSourceKey(latest.workspace);

        const allowStarterWorkspaceToReplaceDefaultCardState =
            sameLiveTool &&
            changedSnap &&
            latestLooksLikeReplaceableCardDefault &&
            nextSnapIsRuntimeStarterWorkspace(nextSnap);

        const allowV5StarterWorkspaceToReplaceOldOrWrongCardState =
            sameLiveTool &&
            changedSnap &&
            isCardToolKey(effectiveToolKey) &&
            nextWorkspaceSchemaVersion >= CARD_STARTER_SCHEMA_VERSION &&
            !!nextWorkspaceSourceKey &&
            (
                latestWorkspaceSchemaVersion < CARD_STARTER_SCHEMA_VERSION ||
                latestWorkspaceSourceKey !== nextWorkspaceSourceKey
            );

        /**
         * ONE-SOURCE RULE:
         *
         * For card/sketch tools, runtimeCard.toolWorkspace is the source of truth.
         * Do not block runtime-card hydration as "unsaved local edits".
         *
         * The old guard was leaving toolWorkspace null, which made CodeToolPane
         * stay forever on "Loading sketch workspace..." even though the runtime
         * card already had the correct starter files.
         */
        const hasUnsavedLocalEdits =
            !isCardToolKey(effectiveToolKey) &&
            sameLiveTool &&
            changedSnap &&
            !allowStarterWorkspaceToReplaceDefaultCardState &&
            !allowV5StarterWorkspaceToReplaceOldOrWrongCardState;

        starterToolDebug("hydrate-guard", {
            viewTid,
            effectiveToolKey,
            toolIdentity,
            hydratedToolIdentity,
            sameLiveTool,
            changedSnap,
            latestCode,
            latestWorkspaceCode,
            defaultCodeTrimmed,
            latestLooksLikeReplaceableCardDefault,
            allowStarterWorkspaceToReplaceDefaultCardState,
            nextWorkspaceSchemaVersion,
            latestWorkspaceSchemaVersion,
            nextWorkspaceSourceKey,
            latestWorkspaceSourceKey,
            allowV5StarterWorkspaceToReplaceOldOrWrongCardState,
            hasUnsavedLocalEdits,
            latest: {
                topicId: latest.topicId,
                toolKey: latest.toolKey,
                lang: latest.lang,
                code: latest.code,
                stdin: latest.stdin,
                workspace: debugWorkspaceSummary(latest.workspace),
            },
            nextSnap: {
                topicId: nextSnap.topicId,
                toolKey: nextSnap.toolKey,
                lang: nextSnap.lang,
                code: nextSnap.code,
                stdin: nextSnap.stdin,
                workspace: debugWorkspaceSummary(nextSnap.workspace),
            },
        });

        if (hasUnsavedLocalEdits) {
            return;
        }

        starterToolDebug("hydrate-apply", {
            viewTid,
            effectiveToolKey,
            nextSnap: {
                lang: nextSnap.lang,
                code: nextSnap.code,
                stdin: nextSnap.stdin,
                workspace: debugWorkspaceSummary(nextSnap.workspace),
            },
        });

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
        runtimeCards,
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
                      (progress as any)?.topics?.[viewTid]?.toolState?.[nextToolKey] ??
                      null;
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
                workspaceKey: workspaceStateKeyForTool({
                    toolKey: nextToolKey,
                    workspace: workspaceForBind,
                }),
                sqlDialect: (savedForBind?.workspace as any)?.sqlDialect ?? resolvedSql.sqlDialect,
                sqlDatasetId:
                    (savedForBind?.workspace as any)?.sqlDatasetId ??
                    resolvedSql.sqlDatasetId,
                sqlSchemaSql:
                    (savedForBind?.workspace as any)?.sqlSchemaSql ??
                    resolvedSql.sqlSchemaSql,
                sqlSeedSql:
                    (savedForBind?.workspace as any)?.sqlSeedSql ??
                    resolvedSql.sqlSeedSql,
                sqlInitialTableSnapshots:
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
            b.onPatch({ codeLang: l, submitted: false, result: null });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey]);

    const setToolCode = useCallback((c: string) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            code: c,
        };
        setToolCode0((prev) => (prev === c ? prev : c));

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({ code: c, submitted: false, result: null });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey]);

    const setToolStdin = useCallback((s: string) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            stdin: s,
        };
        setToolStdin0((prev) => (prev === s ? prev : s));

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({ codeStdin: s, submitted: false, result: null });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey]);

    const setToolWorkspace = useCallback((incomingWorkspace: WorkspaceStateV2 | null) => {
        let workspace = incomingWorkspace;

        if (isCardToolKey(effectiveToolKey)) {
            const cardId = cardIdFromToolKey(effectiveToolKey);
            const canonicalCardKey = canonicalCardKeyFromToolKey(effectiveToolKey);

            if (!canonicalCardKey || !workspace) {
                starterToolDebug("setToolWorkspace-card-rejected", {
                    reason: !canonicalCardKey ? "missing canonicalCardKey" : "missing workspace",
                    viewTid,
                    effectiveToolKey,
                    cardId,
                    incomingWorkspace: debugWorkspaceSummary(incomingWorkspace),
                });
                return;
            }

            const runtimeCardEntry = findRuntimeCardEntryForCard({
                cards: useReviewRuntimeStore.getState().cards ?? {},
                effectiveToolKey,
            }) as [string, any] | undefined;

            const runtimeCardWorkspace =
                runtimeCardEntry?.[1]?.toolWorkspace ?? null;

            if (
                shouldIgnoreIncomingCardWorkspace({
                    incoming: workspace,
                    runtimeWorkspace: runtimeCardWorkspace,
                    currentWorkspace: latestSnapRef.current.workspace,
                })
            ) {
                starterToolDebug("setToolWorkspace-card-ignored", {
                    reason: "incoming workspace is smaller/wrong than protected card workspace",
                    viewTid,
                    effectiveToolKey,
                    cardId,
                    canonicalCardKey,
                    runtimeCardEntryKey: runtimeCardEntry?.[0] ?? null,
                    incomingWorkspace: debugWorkspaceSummary(incomingWorkspace),
                    runtimeCardWorkspace: debugWorkspaceSummary(runtimeCardWorkspace),
                    latestWorkspace: debugWorkspaceSummary(latestSnapRef.current.workspace),
                });
                return;
            }

            const nextWorkspaceKey = workspaceStateKeyForTool({
                toolKey: effectiveToolKey,
                workspace,
            });
            const workspaceCode = deriveEntryCode(workspace);
            const workspaceStdin =
                typeof workspace.stdin === "string"
                    ? workspace.stdin
                    : latestSnapRef.current.stdin;

            const nextSnap = {
                ...latestSnapRef.current,
                topicId: viewTid,
                toolKey: effectiveToolKey,
                code: workspaceCode ?? "",
                stdin: workspaceStdin,
                workspace,
                workspaceKey: nextWorkspaceKey,
            };

            latestSnapRef.current = nextSnap;

            setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
            setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));

            if (toolWorkspaceKeyRef.current !== nextWorkspaceKey) {
                toolWorkspaceKeyRef.current = nextWorkspaceKey;
                setToolWorkspace0(workspace);
                setToolWorkspaceKey(nextWorkspaceKey);
            }

            const runtimeSemanticKey = cardWorkspaceSemanticKey(runtimeCardWorkspace ?? null);
            const nextSemanticKey = cardWorkspaceSemanticKey(workspace);
            const runtimeCode = deriveEntryCode(runtimeCardWorkspace ?? null) ?? "";
            const runtimeStdin =
                typeof runtimeCardWorkspace?.stdin === "string"
                    ? runtimeCardWorkspace.stdin
                    : typeof runtimeCardEntry?.[1]?.toolStdin === "string"
                        ? runtimeCardEntry[1].toolStdin
                        : "";

            const runtimeAlreadyMatches =
                runtimeSemanticKey === nextSemanticKey &&
                runtimeCode === nextSnap.code &&
                runtimeStdin === nextSnap.stdin &&
                runtimeCardEntry?.[1]?.toolKey === effectiveToolKey;

            if (runtimeAlreadyMatches) {
                starterToolDebug("setToolWorkspace-card-skip-canonical-patch", {
                    reason: "incoming workspace already matches canonical runtime card",
                    viewTid,
                    effectiveToolKey,
                    cardId,
                    canonicalCardKey,
                    runtimeCardEntryKey: runtimeCardEntry?.[0] ?? null,
                    semanticMatch: runtimeSemanticKey === nextSemanticKey,
                    workspace: debugWorkspaceSummary(workspace),
                    runtimeWorkspace: debugWorkspaceSummary(runtimeCardWorkspace),
                    code: nextSnap.code,
                    stdin: nextSnap.stdin,
                });

                return;
            }

            starterToolDebug("setToolWorkspace-card-patch-canonical-only", {
                viewTid,
                effectiveToolKey,
                cardId,
                canonicalCardKey,
                runtimeCardEntryKey: runtimeCardEntry?.[0] ?? null,
                workspace: debugWorkspaceSummary(workspace),
                code: nextSnap.code,
                stdin: nextSnap.stdin,
            });

            patchCard(canonicalCardKey, {
                topicId: viewTid,
                cardId,
                toolKey: effectiveToolKey,
                toolWorkspace: workspace,
                toolCode: nextSnap.code,
                toolStdin: nextSnap.stdin,
                toolLang: nextSnap.lang,
            } as any);

            return;
        }

        const nextWorkspaceKey = workspaceStateKeyForTool({
            toolKey: effectiveToolKey,
            workspace,
        });
        const workspaceCode = deriveEntryCode(workspace);
        const workspaceStdin =
            typeof workspace?.stdin === "string"
                ? workspace.stdin
                : latestSnapRef.current.stdin;

        const nextSnap = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            code: workspaceCode ?? "",
            stdin: workspaceStdin,
            workspace,
            workspaceKey: nextWorkspaceKey,
        };

        latestSnapRef.current = nextSnap;

        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));

        if (toolWorkspaceKeyRef.current !== nextWorkspaceKey) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(workspace);
            setToolWorkspaceKey(nextWorkspaceKey);
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
            });
        }
    }, [
        bindingContext,
        commitToolToProgress,
        effectiveBoundId,
        effectiveToolKey,
        patchCard,
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

    /**
     * ONE-SOURCE CARD WORKSPACE RETURN:
     *
     * For card/sketch tools, do not depend on the hook's local toolWorkspace
     * state being updated before CodeToolPane renders.
     *
     * The canonical runtime card is the source of truth, so return its
     * toolWorkspace directly when it exists.
     */
    const returnCanonicalCardKey = isCardToolKey(effectiveToolKey)
        ? canonicalCardKeyFromToolKey(effectiveToolKey)
        : null;

    const returnRuntimeCard = returnCanonicalCardKey
        ? runtimeCards?.[returnCanonicalCardKey] ?? null
        : null;

    const returnRuntimeWorkspace =
        returnRuntimeCard?.toolWorkspace &&
        typeof returnRuntimeCard.toolWorkspace === "object"
            ? (returnRuntimeCard.toolWorkspace as WorkspaceStateV2)
            : null;

    const returnRuntimeCode = deriveEntryCode(returnRuntimeWorkspace) ?? "";
    const returnRuntimeStdin =
        typeof returnRuntimeWorkspace?.stdin === "string"
            ? returnRuntimeWorkspace.stdin
            : typeof returnRuntimeCard?.toolStdin === "string"
                ? returnRuntimeCard.toolStdin
                : defaultStdin;

    const displayHydrated = toolHydrated || !!returnRuntimeWorkspace;

    const returnedToolWorkspace =
        returnRuntimeWorkspace ??
        (displayHydrated ? toolWorkspace : initialWorkspace);

    const returnedToolCode =
        returnRuntimeWorkspace
            ? returnRuntimeCode
            : displayHydrated
                ? toolCode
                : initialCode;

    const returnedToolStdin =
        returnRuntimeWorkspace
            ? returnRuntimeStdin
            : displayHydrated
                ? toolStdin
                : initialStdin;

    const returnedToolLang =
        (returnRuntimeCard?.toolLang as WorkspaceLanguage | undefined) ??
        returnRuntimeWorkspace?.language ??
        (displayHydrated ? toolLang : initialLang);

    return {
        boundId: effectiveBoundId,
        isBound,
        bindCodeInput,
        unbindCodeInput,
        toolHydrated: displayHydrated,

        toolLang: returnedToolLang,
        toolCode: returnedToolCode,
        toolStdin: returnedToolStdin,
        toolWorkspace: returnedToolWorkspace,

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
