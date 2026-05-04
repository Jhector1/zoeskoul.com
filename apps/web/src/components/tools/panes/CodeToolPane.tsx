"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullIDE from "@/components/ide/fullide/FullIDE";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import { createDefaultStateForLanguage } from "@/components/ide/workspaceHook/workspace.normalization";
import type { SqlDialect } from "@/lib/practice/types";
import { useElementSize } from "@/components/tools/hooks/useElementSize";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import { RunnerLanguage } from "@zoeskoul/code-contracts";
import {
    type LearningIdeConfig,
    resolveFullIDEConfigFromLearningIde,
} from "@/lib/ide/learningIdeConfig";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { deriveEntryCode } from "@/components/review/module/runtime/exerciseWorkspaceResolver";

type SqlTableSnapshot = {
    name: string;
    columns: Array<{
        name: string;
        type?: string | null;
    }>;
    rows: unknown[][];
    rowCount: number;
};

type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

function workspaceSemanticKey(workspace: WorkspaceStateV2 | null | undefined) {
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

    const entryNode = workspace.nodes.find(
        (node: any) => node?.kind === "file" && node.id === workspace.entryFileId,
    );
    const activeNode = workspace.nodes.find(
        (node: any) => node?.kind === "file" && node.id === workspace.activeFileId,
    );

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        entryFilePath: pathOf(entryNode),
        activeFilePath: pathOf(activeNode),
        files,
    });
}

function workspaceStateKeyForScope(args: {
    workspace: WorkspaceStateV2 | null | undefined;
    isCardScope: boolean;
}) {
    return args.isCardScope
        ? workspaceSemanticKey(args.workspace)
        : JSON.stringify(args.workspace ?? null);
}

function repairWorkspaceSelection(
    workspace: WorkspaceStateV2 | null | undefined,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }

    const files = workspace.nodes.filter((node: any) => node?.kind === "file");
    const firstFile = files[0] as any;

    if (!firstFile) return workspace;

    const activeExists = files.some((file: any) => file.id === workspace.activeFileId);
    const entryExists = files.some((file: any) => file.id === workspace.entryFileId);

    const entryFileId = entryExists
        ? workspace.entryFileId
        : activeExists
            ? workspace.activeFileId
            : firstFile.id;

    const activeFileId = activeExists
        ? workspace.activeFileId
        : entryFileId;

    if (
        workspace.entryFileId === entryFileId &&
        workspace.activeFileId === activeFileId
    ) {
        return workspace;
    }

    return {
        ...workspace,
        entryFileId,
        activeFileId,
    };
}

function buildToolWorkspace(args: {
    base: WorkspaceStateV2;
    language: RunnerLanguage;
    code: string;
    stdin: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
}): WorkspaceStateV2 {
    const nextNodes = args.base.nodes.map((node) => {
        if (node.kind !== "file") return node;

        if (args.language === "sql") {
            if (node.name === "schema.sql") {
                return { ...node, content: args.sqlSchemaSql ?? "" };
            }

            if (node.name === "seed.sql") {
                return { ...node, content: args.sqlSeedSql ?? "" };
            }

            if (node.name === "query.sql") {
                return { ...node, content: args.code };
            }

            return node;
        }

        if (node.id === (args.base.entryFileId || args.base.activeFileId)) {
            return { ...node, content: args.code };
        }

        return node;
    });

    return {
        ...args.base,
        nodes: nextNodes,
        stdin: args.stdin,
    };
}

function extractWorkspaceSnapshot(workspace: WorkspaceStateV2 | null) {
    if (!workspace) {
        return {
            code: "",
            stdin: "",
        };
    }

    const activeFile =
        workspace.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.activeFileId,
        ) ??
        workspace.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.entryFileId,
        ) ??
        workspace.nodes.find((node) => node.kind === "file") ??
        null;

    return {
        code: activeFile?.kind === "file" ? activeFile.content ?? "" : "",
        stdin: workspace.stdin ?? "",
    };
}

function isExerciseEditorScope(value: string | null | undefined) {
    if (!value) return false;
    if (value === "general") return false;
    if (value.endsWith(":general")) return false;
    if (value.startsWith("code-runner:")) return false;
    return value.split(":").length >= 5;
}

function isCardEditorScope(value: string | null | undefined) {
    if (!value) return false;
    return value.endsWith(":general");
}


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

function chooseWorkspaceWithMostFiles(
    ...workspaces: Array<WorkspaceStateV2 | null | undefined>
) {
    let best: WorkspaceStateV2 | null = null;
    let bestCount = -1;

    for (const workspace of workspaces) {
        const count = workspaceFileCount(workspace);

        if (workspace && count > bestCount) {
            best = workspace;
            bestCount = count;
        }
    }

    return best;
}

function shouldIgnoreIncomingWorkspaceFromIde(args: {
    incoming: WorkspaceStateV2 | null;
    current: WorkspaceStateV2 | null;
    isCardScope?: boolean;
}) {
    const { incoming, current, isCardScope } = args;

    const incomingCount = workspaceFileCount(incoming);
    const currentCount = workspaceFileCount(current);

    /**
     * Strong card-scope guard:
     *
     * If the current card workspace has multiple files, never let FullIDE's
     * smaller mount/default workspace replace it, even if custom metadata was
     * stripped from the emitted workspace.
     */
    if (isCardScope && currentCount > 1 && incomingCount < currentCount) {
        return true;
    }

    const currentSourceKey = workspaceCardStarterSourceKey(current);
    const currentSchema = workspaceCardStarterSchemaVersion(current);

    if (!currentSourceKey || currentSchema < 8) {
        return false;
    }

    const incomingSourceKey = workspaceCardStarterSourceKey(incoming);
    const incomingSchema = workspaceCardStarterSchemaVersion(incoming);

    if (!incomingSourceKey || incomingSchema < currentSchema) {
        return currentCount > 1 && incomingCount < currentCount;
    }

    return incomingSourceKey !== currentSourceKey;
}

function patchToolWorkspaceSource(args: {
    workspace: WorkspaceStateV2;
    language: RunnerLanguage;
    code: string;
    stdin: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
}): WorkspaceStateV2 {
    /**
     * WorkspaceStateV2 is canonical.
     *
     * Do NOT patch file node contents from toolCode here.
     * In multi-file mode, toolCode is only a compatibility mirror of the active
     * file. Writing it back into the workspace can overwrite both the active
     * file and entry/main file at the same time.
     *
     * FullIDE already sends the full updated workspace through onWorkspaceChange.
     */
    return repairWorkspaceSelection({
        ...args.workspace,
        language: args.language,
        stdin: args.stdin,
    }) as WorkspaceStateV2;
}

export default function CodeToolPane(props: {
    height: number;
    toolScopeKey?: string;
    toolHydrated: boolean;
    toolLang: RunnerLanguage;
    toolCode: string;
    toolStdin: string;
    toolWorkspace?: WorkspaceStateV2 | null;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onChangeWorkspace?: (workspace: WorkspaceStateV2 | null) => void;
    onBeforeRun?: () => void | Promise<void>;
    ideConfig?: LearningIdeConfig | null;
    sqlDialect?: SqlDialect;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
}) {
    const {
        toolScopeKey,
        toolHydrated,
        toolLang,
        toolCode,
        toolStdin,
        toolWorkspace,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        onBeforeRun,
        ideConfig,
        sqlDialect = "sqlite",
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
    } = props;

    const tools = useReviewTools();
    const boundId = tools?.boundId ?? null;
    const clearRunFeedback = tools?.clearRunFeedback;
    const setRunFeedbackForCard = tools?.setRunFeedback;
    const syncCodeInputSnapshot = tools?.syncCodeInputSnapshot;

    const { ref, size } = useElementSize<HTMLDivElement>();

    const editorExerciseStateKey = useMemo(() => {
        const rawToolScope =
            typeof toolScopeKey === "string" && toolScopeKey.trim()
                ? toolScopeKey
                : null;

        const scopedToolKey =
            rawToolScope && isExerciseEditorScope(rawToolScope)
                ? rawToolScope
                : null;

        const scopedBoundId =
            boundId && isExerciseEditorScope(boundId)
                ? boundId
                : null;

        /**
         * Valid modes:
         *
         * 1. Exercise mode:
         *    Prefer toolScopeKey because the right rail passes the canonical
         *    full exercise key there.
         *
         * 2. Card/sketch mode:
         *    Use the current card toolScopeKey.
         *
         * Do not prefer boundId first; in this app it can be the legacy
         * review-quiz/input id, which makes CodeRunner bind to the wrong model.
         */
        if (scopedToolKey) return scopedToolKey;
        if (scopedBoundId) return scopedBoundId;
        if (rawToolScope) return rawToolScope;

        return "general";
    }, [toolScopeKey, boundId]);

    const exerciseKey =
        !isCardEditorScope(editorExerciseStateKey) &&
        isExerciseEditorScope(editorExerciseStateKey)
            ? editorExerciseStateKey
            : null;

    const storeExercise = useReviewRuntimeStore((s) =>
        exerciseKey ? s.exercises[exerciseKey] : null,
    );
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);
    const patchExerciseSafe =
        typeof patchExercise === "function"
            ? patchExercise
            : null;

    const isSql = toolLang === "sql";

    const ideShell = useMemo(
        () => resolveFullIDEConfigFromLearningIde({ ideConfig }),
        [ideConfig],
    );
    const shouldForceDesktopLayout = ideShell.services.explorer?.enabled === true;
    const usesWorkspaceShell =
        shouldForceDesktopLayout || ideShell.access.canUseMultiFile;
    const workspaceContextKey = useMemo(
        () =>
            JSON.stringify({
                scope: editorExerciseStateKey ?? "general",
                boundId: boundId ?? "unbound",
                language: toolLang,
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
                workspaceShell: usesWorkspaceShell,
            }),
        [
            boundId,
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
            toolLang,
            toolScopeKey,
            editorExerciseStateKey,
            usesWorkspaceShell,
        ],
    );
    const runnerH = Math.max(usesWorkspaceShell ? 480 : 320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);
    const lastEmittedRef = useRef<{ code: string; stdin: string } | null>(null);
    const lastIncomingRef = useRef<{ code: string; stdin: string } | null>(null);
    const persistTimerRef = useRef<number | null>(null);
    const lastUpstreamWorkspaceKeyRef = useRef<string>("");
    const isCardWorkspaceScope = isCardEditorScope(editorExerciseStateKey);
    const baseWorkspace = useMemo(
        () => createDefaultStateForLanguage(toolLang),
        [toolLang],
    );

    const externalWorkspace = useMemo(
        () =>
            repairWorkspaceSelection(
                buildToolWorkspace({
                    base: baseWorkspace,
                    language: toolLang,
                    code: toolCode,
                    stdin: toolStdin,
                    sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                    sqlSeedSql: sqlSeedSql ?? "",
                }),
            ) as WorkspaceStateV2,
        [
            baseWorkspace,
            toolLang,
            toolCode,
            toolStdin,
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
        ],
    );
    const resolvedIncomingWorkspace = useMemo(() => {
        if (storeExercise?.workspace) {
            return repairWorkspaceSelection(storeExercise.workspace) as WorkspaceStateV2;
        }

        if (toolWorkspace) {
            if (isCardWorkspaceScope) {
                return repairWorkspaceSelection(toolWorkspace) as WorkspaceStateV2;
            }

            return patchToolWorkspaceSource({
                workspace: toolWorkspace,
                language: toolLang,
                code: toolCode,
                stdin: toolStdin,
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
            });
        }

        if (isCardWorkspaceScope) {
            /**
             * Card/sketch scope with no starter/runtime workspace:
             *
             * Once the tool has hydrated and there is still no card workspace,
             * show an empty default editor instead of returning null forever.
             *
             * Starter-backed cards still take the toolWorkspace path above.
             */
            return toolHydrated
                ? repairWorkspaceSelection(externalWorkspace) as WorkspaceStateV2
                : null;
        }

        if (!usesWorkspaceShell) {
            return repairWorkspaceSelection(externalWorkspace) as WorkspaceStateV2;
        }

        if (!toolHydrated) {
            return repairWorkspaceSelection(externalWorkspace) as WorkspaceStateV2;
        }

        return repairWorkspaceSelection(externalWorkspace) as WorkspaceStateV2;
    }, [
        storeExercise?.workspace,
        externalWorkspace,
        isCardWorkspaceScope,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        toolCode,
        toolHydrated,
        toolLang,
        toolStdin,
        toolWorkspace,
        usesWorkspaceShell,
    ]);
    const latestWorkspaceRef = useRef<WorkspaceStateV2 | null>(resolvedIncomingWorkspace);
    const [workspaceBridge, setWorkspaceBridge] = useState<WorkspaceStateV2 | null>(
        resolvedIncomingWorkspace,
    );
    const workspaceBridgeKeyRef = useRef(workspaceSemanticKey(resolvedIncomingWorkspace));
    const [prevContextKey, setPrevContextKey] = useState(workspaceContextKey);

    // Derived-state sync: update workspaceBridge synchronously before FullIDE remounts so
    // it always receives the correct initialWorkspace when workspaceContextKey changes.
    if (prevContextKey !== workspaceContextKey) {
        setPrevContextKey(workspaceContextKey);
        setWorkspaceBridge(resolvedIncomingWorkspace);
        workspaceBridgeKeyRef.current = workspaceSemanticKey(resolvedIncomingWorkspace);
    }

    useEffect(() => {
        latestWorkspaceRef.current = workspaceBridge;
        workspaceBridgeKeyRef.current = workspaceSemanticKey(workspaceBridge);
    }, [workspaceBridge]);

    const setWorkspaceBridgeIfChanged = useCallback((workspace: WorkspaceStateV2 | null) => {
        const nextKey = workspaceSemanticKey(workspace);

        latestWorkspaceRef.current = workspace;

        if (workspaceBridgeKeyRef.current === nextKey) {
            return;
        }

        workspaceBridgeKeyRef.current = nextKey;
        setWorkspaceBridge(workspace);
    }, []);

    useEffect(() => {
        setWorkspaceBridgeIfChanged(resolvedIncomingWorkspace);
    }, [resolvedIncomingWorkspace, setWorkspaceBridgeIfChanged]);

    useEffect(() => {
        // New exercise/tool scope: do not let previous exercise emission guards
        // suppress or reuse the new exercise workspace.
        lastEmittedRef.current = null;
        lastIncomingRef.current = null;
        lastUpstreamWorkspaceKeyRef.current = "";

        // Force the currently active exercise workspace into FullIDE.
        setWorkspaceBridgeIfChanged(resolvedIncomingWorkspace);
    }, [workspaceContextKey, resolvedIncomingWorkspace, setWorkspaceBridgeIfChanged]);

    useEffect(() => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
    }, [toolLang, toolCode, toolStdin, boundId, clearRunFeedback]);

    useEffect(() => {
        return () => {
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        lastIncomingRef.current = {
            code: toolCode,
            stdin: toolStdin,
        };
    }, [toolCode, toolStdin]);

    const emitWorkspaceUpstream = useCallback((workspace: WorkspaceStateV2 | null) => {
        const workspaceKey = workspaceStateKeyForScope({
            workspace,
            isCardScope: isCardWorkspaceScope,
        });
        if (lastUpstreamWorkspaceKeyRef.current === workspaceKey) return;
        lastUpstreamWorkspaceKeyRef.current = workspaceKey;

        onChangeWorkspace?.(workspace);

        const next = extractWorkspaceSnapshot(workspace);
        const prevEmitted = lastEmittedRef.current;
        const prevIncoming = lastIncomingRef.current;
        const workspacePatch =
            workspace && typeof workspace === "object"
                ? {
                    workspace,
                    codeWorkspace: workspace,
                    ideWorkspace: workspace,
                }
                : {};

        if (boundId) {
            syncCodeInputSnapshot?.(boundId, {
                ...workspacePatch,
                code: next.code,
                codeStdin: next.stdin,
                submitted: false,
                result: null,
            });        }

        if (prevEmitted && prevEmitted.code === next.code && prevEmitted.stdin === next.stdin) {
            return;
        }

        if (prevIncoming && prevIncoming.code === next.code && prevIncoming.stdin === next.stdin) {
            lastEmittedRef.current = next;
            return;
        }

        lastEmittedRef.current = next;
        setRunFeedback(null);

        if (boundId) {
            clearRunFeedback?.(boundId);
        }

        onChangeCode(next.code);
        onChangeStdin(next.stdin);

    }, [
        boundId,
        clearRunFeedback,
        isCardWorkspaceScope,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        syncCodeInputSnapshot,
    ]);
    const emitWorkspaceUpstreamRef = useRef(emitWorkspaceUpstream);

    useEffect(() => {
        emitWorkspaceUpstreamRef.current = emitWorkspaceUpstream;
    }, [emitWorkspaceUpstream]);

    const handleWorkspaceChange = useCallback((incomingWorkspace: WorkspaceStateV2 | null) => {
        let workspace = incomingWorkspace;

        const protectedWorkspace = chooseWorkspaceWithMostFiles(
            latestWorkspaceRef.current,
            toolWorkspace,
            workspaceBridge,
        );

        if (
            workspace &&
            shouldIgnoreIncomingWorkspaceFromIde({
                incoming: workspace,
                current: protectedWorkspace,
                isCardScope: isCardEditorScope(editorExerciseStateKey),
            })
        ) {
            if (typeof window !== "undefined") {
                const enabled =
                    window.localStorage.getItem("zoe:debug:starter-files") === "1";

                if (enabled) {
                    console.warn("[starter-files] CodeToolPane hard-ignored incoming IDE workspace", {
                        reason: "incoming workspace has fewer files than protected card workspace",
                        incomingFileCount: workspaceFileCount(workspace),
                        protectedFileCount: workspaceFileCount(protectedWorkspace),
                        incomingFiles: workspace.nodes
                            ?.filter((node: any) => node?.kind === "file")
                            ?.map((node: any) => ({
                                name: node.name,
                                contentPreview: String(node.content ?? "").slice(0, 80),
                                contentLength: String(node.content ?? "").length,
                            })),
                        protectedFiles: protectedWorkspace?.nodes
                            ?.filter((node: any) => node?.kind === "file")
                            ?.map((node: any) => ({
                                name: node.name,
                                contentPreview: String(node.content ?? "").slice(0, 80),
                                contentLength: String(node.content ?? "").length,
                            })),
                        incomingSourceKey: workspaceCardStarterSourceKey(workspace),
                        protectedSourceKey: workspaceCardStarterSourceKey(protectedWorkspace),
                        incomingSchema: workspaceCardStarterSchemaVersion(workspace),
                        protectedSchema: workspaceCardStarterSchemaVersion(protectedWorkspace),
                    });
                }
            }

            return;
        }

        if (workspace) {
            setWorkspaceBridgeIfChanged(workspace);

            if (exerciseKey && !isCardEditorScope(editorExerciseStateKey)) {
                const entryCode = deriveEntryCode(workspace) ?? "";

                if (patchExerciseSafe) {
                    patchExerciseSafe(exerciseKey, {
                        workspace,
                        code: entryCode,
                        stdin: workspace.stdin ?? "",
                    });
                } else if (typeof window !== "undefined") {
                    const enabled =
                        window.localStorage.getItem("zoe:debug:starter-files") === "1";

                    if (enabled) {
                        console.warn("[starter-files] CodeToolPane missing patchExercise", {
                            exerciseKey,
                            workspace,
                            entryCode,
                        });
                    }
                }
            }

            if (boundId) {
                const snap = extractWorkspaceSnapshot(workspace);

                syncCodeInputSnapshot?.(boundId, {
                    workspace,
                    codeWorkspace: workspace,
                    ideWorkspace: workspace,
                    code: snap.code,
                    codeStdin: snap.stdin,
                    submitted: false,
                    result: null,
                });
            }
        } else {
            latestWorkspaceRef.current = null;
        }

        if (!usesWorkspaceShell) {
            emitWorkspaceUpstream(workspace);
            return;
        }

        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = window.setTimeout(() => {
            persistTimerRef.current = null;
            emitWorkspaceUpstreamRef.current(latestWorkspaceRef.current);
        }, 220);
    }, [
        exerciseKey,
        patchExerciseSafe,
        boundId,
        emitWorkspaceUpstream,
        setWorkspaceBridgeIfChanged,
        syncCodeInputSnapshot,
        toolWorkspace,
        usesWorkspaceShell,
        workspaceBridge,
    ]);

    useEffect(() => {
        return () => {
            if (!usesWorkspaceShell) return;
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
            emitWorkspaceUpstreamRef.current(latestWorkspaceRef.current);
        };
    }, [workspaceContextKey, usesWorkspaceShell]);

    const handleBeforeRun = useCallback(async () => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
        await onBeforeRun?.();
    }, [boundId, clearRunFeedback, onBeforeRun]);

    const handleRunResult = useCallback(({ result, runArgs }: { result: any; runArgs: any }) => {
        const feedback = pickRunFeedbackFromResult({
            result,
            language: runArgs.language,
            code: runArgs.code,
        });

        setRunFeedback(feedback);

        if (boundId) {
            setRunFeedbackForCard?.(boundId, feedback);
        }
    }, [boundId, setRunFeedbackForCard]);

    const reviewToolLocalWorkspaceId = useMemo(() => {
        /**
         * This must be stable per review card/exercise scope.
         *
         * Do NOT include workspaceBridge/workspace hash here. Changing this id
         * when activeFileId/code changes makes FullIDE rehydrate its local
         * workspace state repeatedly, which causes the tree to blink and can
         * fall back to the one-file src/main.py workspace.
         */
        return `review-tool:${editorExerciseStateKey ?? "general"}`;
    }, [editorExerciseStateKey]);

    /**
     * ONE-SOURCE CARD WORKSPACE RULE:
     *
     * For sketch/card tools, do not mount FullIDE until the runtime card
     * workspace exists.
     *
     * If FullIDE mounts before toolWorkspace is ready, it creates/emits the
     * generic one-file workspace:
     *
     *   src/main.py
     *
     * That default workspace is the root of the tree blanking/collapse bug.
     */
    const cardWorkspaceReady =
        !isCardWorkspaceScope ||
        !!toolWorkspace ||
        !!workspaceBridge ||
        !!resolvedIncomingWorkspace ||
        toolHydrated;

    if (typeof window !== "undefined") {
        const enabled =
            window.localStorage.getItem("zoe:debug:starter-files") === "1";

        if (enabled) {
            console.log("[starter-files] CodeToolPane.workspace-handoff", {
                editorExerciseStateKey,
                toolScopeKey,
                toolHydrated,
                usesWorkspaceShell,
                cardWorkspaceIsSourceOfTruth: isCardWorkspaceScope,
                cardWorkspaceReady,
                cardWorkspaceReadyReason: !isCardWorkspaceScope
                    ? "not-card"
                    : toolWorkspace
                        ? "toolWorkspace"
                        : workspaceBridge
                            ? "workspaceBridge"
                            : resolvedIncomingWorkspace
                                ? "resolvedIncomingWorkspace"
                            : toolHydrated
                                ? "hydrated-empty-default"
                                : "not-ready",
                toolWorkspaceFileCount: workspaceFileCount(toolWorkspace),
                workspaceBridgeFileCount: workspaceFileCount(workspaceBridge),
                exerciseKey,
                willPatchExercise: !!exerciseKey && !isCardEditorScope(editorExerciseStateKey),
                toolWorkspaceFiles: toolWorkspace?.nodes
                    ?.filter((node: any) => node?.kind === "file")
                    ?.map((node: any) => ({
                        name: node.name,
                        contentPreview: String(node.content ?? "").slice(0, 80),
                        contentLength: String(node.content ?? "").length,
                    })),
                workspaceBridgeFiles: workspaceBridge?.nodes
                    ?.filter((node: any) => node?.kind === "file")
                    ?.map((node: any) => ({
                        name: node.name,
                        contentPreview: String(node.content ?? "").slice(0, 80),
                        contentLength: String(node.content ?? "").length,
                    })),
                workspaceBridgeEntryFileId: workspaceBridge?.entryFileId,
                workspaceBridgeActiveFileId: workspaceBridge?.activeFileId,
                workspaceBridgeKey: workspaceSemanticKey(workspaceBridge),
                reviewToolLocalWorkspaceId,
                starterSignature: (workspaceBridge as any)?.starterSignature ?? null,
            });
        }
    }

    /**
     * FullIDE treats initialWorkspace like an initial value.
     *
     * During exercise navigation, toolHydrated is briefly false and the bridge can
     * contain a blank/default workspace. If FullIDE mounts during that moment, it
     * can stay blank even after the real exercise workspace arrives.
     *
     * Include hydration state in the key so FullIDE remounts once when the real
     * exercise workspace is ready.
     */

    const fullIdeKey = workspaceContextKey;

    if (!cardWorkspaceReady) {
        return (
            <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                <div className="flex h-full min-h-[320px] flex-1 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-500 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-400">
                    Loading sketch workspace...
                </div>
            </div>
        );
    }

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="relative h-full min-h-0 flex-1">
                <FullIDE
                    key={fullIdeKey}
                    title={isSql ? "Run SQL" : "Run code"}
                    height={runnerH - 50}
                    fullHeight
                    language={toolLang}
                    access={{
                        hasUser: true,
                        /**
                         * Important:
                         *
                         * If the learning IDE shell enables the explorer, the
                         * workspace must be allowed to stay multi-file.
                         *
                         * Otherwise useIdeWorkspace.normalizeWorkspaceForAccess()
                         * collapses the starter workspace into one default file:
                         *
                         *   src/main.py
                         *
                         * That is why sketch starter files like README.md,
                         * notes.md, and formula.md disappear.
                         */
                        canUseMultiFile: isSql || usesWorkspaceShell || isCardWorkspaceScope,
                        canSaveCloud: ideShell.access.canSaveCloud,
                        canCreateProjects: ideShell.access.canCreateProjects,
                    }}
                    loginHref="/authenticate"
                    billingHref="/billing"
                    draftStorageMode="off"
                    localWorkspaceId={reviewToolLocalWorkspaceId}
                    servicePreset={ideShell.servicePreset}
                    forceDesktopLayout={shouldForceDesktopLayout}
                    services={{
                        ...ideShell.services,
                        runner: {
                            ...(ideShell.services.runner ?? {}),
                            showThemeToggle: true,
                            showSqlDialectPicker: false,
                        },
                    }}
                    initialWorkspace={workspaceBridge}
                    externalWorkspace={workspaceBridge}
                    exerciseStateKey={editorExerciseStateKey}
                    projectScope={{
                        kind: "review-tool" as any,
                        scopeKey: `review-tool:${editorExerciseStateKey ?? "general"}`,
                    }}
                    onWorkspaceChange={handleWorkspaceChange}
                    onBeforeRun={handleBeforeRun}
                    onRunResult={handleRunResult}
                    initialSqlDialect={sqlDialect}
                    sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                />

                {/*{showLoadingMask ? (*/}
                {/*    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">*/}
                {/*        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/80">*/}
                {/*            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />*/}
                {/*            Loading editor...*/}
                {/*        </div>*/}
                {/*    </div>*/}
                {/*) : null}*/}
            </div>

            {!isSql && runFeedback ? (
                <div className="mt-3">
                    <CodeFeedbackCallout feedback={runFeedback} />
                </div>
            ) : null}
        </div>
    );
}
