"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import FullIDE from "@/components/ide/fullide/FullIDE";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlDialect, WorkspaceLanguage } from "@/lib/practice/types";
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

function asWorkspaceLanguage(language: string | null | undefined): WorkspaceLanguage {
    const value = String(language ?? "");
    if (
        value === "python" ||
        value === "java" ||
        value === "javascript" ||
        value === "c" ||
        value === "cpp" ||
        value === "sql" ||
        value === "bash" ||
        value === "web"
    ) {
        return value as WorkspaceLanguage;
    }

    return "python";
}

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
function reviewWorkspaceHasNonEmptyFile(workspace: WorkspaceStateV2 | null | undefined) {
    // Starter/review workspaces are authoritative. Any workspace with at least
    // one file node counts as usable, even if that file contains fallback text.
    return Boolean(workspace?.nodes?.some((node: any) => node?.kind === "file"));
}

function forceWorkspaceHasContent(workspace: WorkspaceStateV2 | null | undefined) {
    // Starter/review workspaces are authoritative. Any workspace with at least
    // one file node counts as content.
    return Boolean(workspace?.nodes?.some((node: any) => node?.kind === "file"));
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
    if (value.startsWith("card:")) return false;
    if (value.endsWith(":general")) return false;
    if (value.includes(":card:general")) return false;
    if (value.startsWith("code-runner:")) return false;
    return value.split(":").length >= 5;
}

function isCardEditorScope(value: string | null | undefined) {
    if (!value) return false;
    if (value.startsWith("card:")) return true;
    if (value.endsWith(":general")) return true;
    return false;
}

function cardIdFromEditorScope(value: string) {
    if (value.startsWith("card:")) return value.replace(/^card:/, "");

    const parts = value.split(":").filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1] === "general") {
        return parts[parts.length - 2];
    }

    return value;
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
    return {
        ...args.workspace,
        language: args.language,
        stdin: args.stdin,
    };
}

export default function CodeToolPane(props: {
    height: number;
    editorOwnerKey?: string | null;
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
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
}) {
    const {
        toolScopeKey,
        editorOwnerKey,
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
        sqlDatasetId,
        sqlResultShape,
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

    const exerciseKey = isExerciseEditorScope(editorExerciseStateKey)
        ? editorExerciseStateKey
        : null;

    const cardRuntimeKey = useMemo(() => {
        if (!isCardEditorScope(editorExerciseStateKey)) return null;
        if (editorExerciseStateKey.startsWith("card:")) {
            return editorExerciseStateKey.replace(/^card:/, "");
        }
        return editorExerciseStateKey.replace(/:general$/, "");
    }, [editorExerciseStateKey]);
    const derivedEditorOwnerKey = exerciseKey ?? cardRuntimeKey ?? null;
    const resolvedEditorOwnerKey =
        typeof editorOwnerKey === "string" && editorOwnerKey.trim()
            ? editorOwnerKey.trim()
            : derivedEditorOwnerKey;
    const editorRuntime = useReviewRuntimeStore((s) =>
        resolvedEditorOwnerKey ? s.editorRuntimes[resolvedEditorOwnerKey] ?? null : null,
    );
    const patchEditorWorkspace = useReviewRuntimeStore((s) => s.patchEditorWorkspace);

    /**
     * REVIEW DIRECT WORKSPACE MODE
     *
     * This bypasses the legacy bridge/hydration path for route-owned review
     * targets. If the current exercise/card runtime has a ready workspace,
     * that workspace is the only source for FullIDE.
     */
    const reviewDirectWorkspace =
        editorRuntime?.workspaceStatus === "ready" && editorRuntime.workspace
            ? editorRuntime.workspace
            : null;

    const reviewDirectWorkspaceReady = !!reviewDirectWorkspace;
    const isReviewRouteMode = Boolean(resolvedEditorOwnerKey);
    const reviewDirectWorkspaceError = editorRuntime?.workspaceStatus === "error";
    const effectiveLanguage = (isReviewRouteMode ? editorRuntime?.language : null) ?? toolLang;
    const isSql = effectiveLanguage === "sql";

    const ideShell = useMemo(
        () => resolveFullIDEConfigFromLearningIde({ ideConfig }),
        [ideConfig],
    );
    const shouldForceDesktopLayout = ideShell.services.explorer?.enabled === true;

// Important:
// Review runtime always passes a WorkspaceStateV2, even for one-file starters.
// So force workspace shell whenever review runtime has a ready workspace.
// Otherwise single-file starter can get stuck in the legacy "single" loading path.
    const usesWorkspaceShell =
        reviewDirectWorkspaceReady || shouldForceDesktopLayout || ideShell.access.canUseMultiFile;
    const workspaceOwnerKey = resolvedEditorOwnerKey ?? editorExerciseStateKey ?? toolScopeKey ?? boundId ?? "general";

    const workspaceContextKey = useMemo(
        () =>
            JSON.stringify({
                ownerKey: workspaceOwnerKey,
                language: effectiveLanguage,
                sqlDatasetId: sqlDatasetId ?? "",
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
                workspaceShell: usesWorkspaceShell,
            }),
        [
            workspaceOwnerKey,
            sqlDatasetId,
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
            effectiveLanguage,
            usesWorkspaceShell,
        ],
    );
    const runnerH = Math.max(usesWorkspaceShell ? 480 : 320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);
    const [ideReady, setIdeReady] = useState(false);
    const persistTimerRef = useRef<number | null>(null);
    const lastUpstreamWorkspaceKeyRef = useRef<string>("");
    const lastHandledWorkspaceKeyRef = useRef<string>("");
    const applyingExternalWorkspaceRef = useRef(false);

    const exerciseWorkspaceReady = Boolean(exerciseKey && editorRuntime?.workspaceStatus === "ready" && editorRuntime.workspace);
    const cardWorkspaceReady = Boolean(cardRuntimeKey && editorRuntime?.workspaceStatus === "ready" && editorRuntime.workspace);
    const runtimeWorkspaceError = Boolean(isReviewRouteMode && editorRuntime?.workspaceStatus === "error");

    const directRuntimeWorkspace = useMemo(() => {
        if (isReviewRouteMode) {
            return editorRuntime?.workspaceStatus === "ready"
                ? (editorRuntime?.workspace ?? null)
                : null;
        }

        if (reviewWorkspaceHasNonEmptyFile(toolWorkspace)) {
            return toolWorkspace ?? null;
        }

        return toolWorkspace ?? null;
    }, [
        isReviewRouteMode,
        editorRuntime?.workspaceStatus,
        editorRuntime?.workspace,
        toolWorkspace,
    ]);

    const finalReviewWorkspace = directRuntimeWorkspace;
    const finalReviewWorkspaceKey = useMemo(
        () => workspaceKeyOf(finalReviewWorkspace ?? null),
        [finalReviewWorkspace],
    );
    const runtimeWorkspacePending =
        isReviewRouteMode &&
        !runtimeWorkspaceError &&
        (!editorRuntime || editorRuntime.workspaceStatus === "pending");

    const canRenderEditor = Boolean(
        finalReviewWorkspace &&
        !runtimeWorkspaceError &&
        forceWorkspaceHasContent(finalReviewWorkspace),
    );

    const showLoadingMask =
        !runtimeWorkspaceError &&
        !canRenderEditor &&
        (runtimeWorkspacePending || (!isReviewRouteMode && usesWorkspaceShell));

    useEffect(() => {
        setIdeReady(false);
        lastUpstreamWorkspaceKeyRef.current = finalReviewWorkspaceKey;
        lastHandledWorkspaceKeyRef.current = finalReviewWorkspaceKey;
        applyingExternalWorkspaceRef.current = true;
    }, [workspaceContextKey, finalReviewWorkspaceKey]);

    useEffect(() => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
    }, [effectiveLanguage, toolCode, toolStdin, boundId, clearRunFeedback]);

    useEffect(() => {
        return () => {
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
        };
    }, []);

    const emitWorkspaceUpstream = useCallback((workspace: WorkspaceStateV2 | null) => {
        const workspaceKey = workspaceKeyOf(workspace ?? null);
        if (lastUpstreamWorkspaceKeyRef.current === workspaceKey) return;
        lastUpstreamWorkspaceKeyRef.current = workspaceKey;
        lastHandledWorkspaceKeyRef.current = workspaceKey;

        const next = extractWorkspaceSnapshot(workspace);
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
                source: next.code,
                stdin: next.stdin,
                codeStdin: next.stdin,
                language: effectiveLanguage,
                lang: effectiveLanguage,
                submitted: false,
                result: null,
                userEdited: true,
                workspaceOrigin: "user",
                    updatedAt: Date.now(),
            });
        }
        setRunFeedback(null);

        if (boundId) {
            clearRunFeedback?.(boundId);
        }

        if (isReviewRouteMode && resolvedEditorOwnerKey) {
            patchEditorWorkspace(resolvedEditorOwnerKey, workspace);
            return;
        }

        onChangeWorkspace?.(workspace);
        onChangeCode(next.code);
        onChangeStdin(next.stdin);

    }, [
        boundId,
        clearRunFeedback,
        effectiveLanguage,
        resolvedEditorOwnerKey,
        isReviewRouteMode,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        patchEditorWorkspace,
        syncCodeInputSnapshot,
    ]);
    const emitWorkspaceUpstreamRef = useRef(emitWorkspaceUpstream);

    useEffect(() => {
        emitWorkspaceUpstreamRef.current = emitWorkspaceUpstream;
    }, [emitWorkspaceUpstream]);

    const handleWorkspaceChange = useCallback((workspace: WorkspaceStateV2 | null) => {
        const nextWorkspaceKey = workspaceKeyOf(workspace ?? null);

        if (
            applyingExternalWorkspaceRef.current &&
            nextWorkspaceKey === lastUpstreamWorkspaceKeyRef.current
        ) {
            applyingExternalWorkspaceRef.current = false;
            lastHandledWorkspaceKeyRef.current = nextWorkspaceKey;
            return;
        }

        applyingExternalWorkspaceRef.current = false;

        if (lastHandledWorkspaceKeyRef.current === nextWorkspaceKey) {
            return;
        }

        lastHandledWorkspaceKeyRef.current = nextWorkspaceKey;

        if (!usesWorkspaceShell) {
            emitWorkspaceUpstream(workspace);
            return;
        }

        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = window.setTimeout(() => {
            persistTimerRef.current = null;
            emitWorkspaceUpstreamRef.current(workspace);
        }, 220);
    }, [emitWorkspaceUpstream, usesWorkspaceShell]);

    useEffect(() => {
        return () => {
            if (!usesWorkspaceShell) return;
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
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

    /**
     * DIRECT REVIEW WORKSPACE MODE
     *
     * For route-owned review targets, the runtime store is the source of truth.
     * Do not wait for workspaceBridge handoff to decide whether FullIDE can mount.
     *
     * route target -> runtime store workspace -> FullIDE
     */
    const fullIdeKey = `${workspaceOwnerKey}:${effectiveLanguage}:${usesWorkspaceShell ? "workspace" : "single"}`;
    const fullIdeLanguage = asWorkspaceLanguage(effectiveLanguage);

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="relative h-full min-h-0 flex-1">
                {canRenderEditor ? (
                    <FullIDE
                        key={fullIdeKey}
                        title={isSql ? "Run SQL" : "Run code"}
                        height={runnerH - 50}
                        fullHeight
                        language={fullIdeLanguage}
                        access={{
                            hasUser: true,
                            canUseMultiFile: isSql || reviewDirectWorkspaceReady || ideShell.access.canUseMultiFile,
                            canSaveCloud: ideShell.access.canSaveCloud,
                            canCreateProjects: ideShell.access.canCreateProjects,
                        }}
                        loginHref="/authenticate"
                        billingHref="/billing"
                        draftStorageMode="off"
                        servicePreset={ideShell.servicePreset}
                        // forceDesktopLayout={shouldForceDesktopLayout}
                        forceDesktopLayout={usesWorkspaceShell}
                        services={{
                            ...ideShell.services,
                            runner: {
                                ...(ideShell.services.runner ?? {}),
                                showThemeToggle: true,
                                showSqlDialectPicker: false,
                            },
                        }}
                        initialWorkspace={finalReviewWorkspace}
                        externalWorkspace={finalReviewWorkspace}
                        exerciseStateKey={workspaceOwnerKey}
                        projectScope={{
                            kind: "review-tool" as any,
                            scopeKey: `review-tool:${workspaceOwnerKey}`,
                        }}
                        onWorkspaceChange={handleWorkspaceChange}
                        onBeforeRun={handleBeforeRun}
                        onRunResult={handleRunResult}
                        onReadyChange={setIdeReady}
                        initialSqlDialect={sqlDialect}
                        sqlDatasetId={sqlDatasetId}
                        sqlResultShape={sqlResultShape}
                        sqlSchemaSql={sqlSchemaSql ?? sqlSetupSql}
                        sqlSeedSql={sqlSeedSql}
                        sqlSetupSql={sqlSetupSql}
                        sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                    />
                ) : null}

                {showLoadingMask ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">
                        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/80">
                            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                            {cardRuntimeKey ? "Loading sketch workspace..." : "Loading editor..."}
                        </div>
                    </div>
                ) : null}
            </div>

            {!isSql && runFeedback ? (
                <div className="mt-3">
                    <CodeFeedbackCallout feedback={runFeedback} />
                </div>
            ) : null}
        </div>
    );
}
