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

function workspaceKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
    return JSON.stringify(workspace ?? null);
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

        if (node.id === args.base.activeFileId || node.id === args.base.entryFileId) {
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

function patchToolWorkspaceSource(args: {
    workspace: WorkspaceStateV2;
    language: RunnerLanguage;
    code: string;
    stdin: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
}): WorkspaceStateV2 {
    const nextNodes = args.workspace.nodes.map((node) => {
        if (node.kind !== "file") return node;

        if (args.language === "sql") {
            if (node.name === "schema.sql") {
                return { ...node, content: args.sqlSchemaSql ?? "" };
            }

            if (node.name === "seed.sql") {
                return { ...node, content: args.sqlSeedSql ?? "" };
            }

            if (node.id === args.workspace.activeFileId || node.id === args.workspace.entryFileId) {
                return { ...node, content: args.code };
            }

            return node;
        }

        if (node.id === args.workspace.activeFileId || node.id === args.workspace.entryFileId) {
            return { ...node, content: args.code };
        }

        return node;
    });

    return {
        ...args.workspace,
        language: args.language,
        nodes: nextNodes,
        stdin: args.stdin,
    };
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
                scope: toolScopeKey ?? "general",
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
            usesWorkspaceShell,
        ],
    );
    const runnerH = Math.max(usesWorkspaceShell ? 480 : 320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);
    const [ideReady, setIdeReady] = useState(false);
    const lastEmittedRef = useRef<{ code: string; stdin: string } | null>(null);
    const lastIncomingRef = useRef<{ code: string; stdin: string } | null>(null);
    const persistTimerRef = useRef<number | null>(null);
    const lastUpstreamWorkspaceKeyRef = useRef<string>("");
    const baseWorkspace = useMemo(
        () => createDefaultStateForLanguage(toolLang),
        [toolLang],
    );

    const externalWorkspace = useMemo(
        () =>
            buildToolWorkspace({
                base: baseWorkspace,
                language: toolLang,
                code: toolCode,
                stdin: toolStdin,
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
            }),
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
        if (!usesWorkspaceShell) {
            return externalWorkspace;
        }

        if (!toolHydrated) {
            return externalWorkspace;
        }

        if (toolWorkspace) {
            return patchToolWorkspaceSource({
                workspace: toolWorkspace,
                language: toolLang,
                code: toolCode,
                stdin: toolStdin,
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
            });
        }

        return externalWorkspace;
    }, [
        externalWorkspace,
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
    const latestWorkspaceRef = useRef<WorkspaceStateV2 | null>(toolWorkspace ?? externalWorkspace);
    const [workspaceBridge, setWorkspaceBridge] = useState<WorkspaceStateV2>(
        toolWorkspace ?? externalWorkspace,
    );
    const workspaceBridgeKeyRef = useRef(workspaceKeyOf(toolWorkspace ?? externalWorkspace));
    const lastContextKeyRef = useRef<string>("");

    useEffect(() => {
        latestWorkspaceRef.current = workspaceBridge;
        workspaceBridgeKeyRef.current = workspaceKeyOf(workspaceBridge);
    }, [workspaceBridge]);

    const setWorkspaceBridgeIfChanged = useCallback((workspace: WorkspaceStateV2) => {
        const nextKey = workspaceKeyOf(workspace);

        latestWorkspaceRef.current = workspace;

        if (workspaceBridgeKeyRef.current === nextKey) {
            return;
        }

        workspaceBridgeKeyRef.current = nextKey;
        setWorkspaceBridge(workspace);
    }, []);

    useEffect(() => {
        if (lastContextKeyRef.current !== workspaceContextKey) {
            lastContextKeyRef.current = workspaceContextKey;
            setWorkspaceBridgeIfChanged(resolvedIncomingWorkspace);
            lastEmittedRef.current = null;
            return;
        }

        setWorkspaceBridgeIfChanged(resolvedIncomingWorkspace);
    }, [
        resolvedIncomingWorkspace,
        workspaceContextKey,
        setWorkspaceBridgeIfChanged,
    ]);

    useEffect(() => {
        setIdeReady(false);
    }, [workspaceContextKey]);

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
        const workspaceKey = JSON.stringify(workspace ?? null);
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
            });
        }

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
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        syncCodeInputSnapshot,
    ]);
    const emitWorkspaceUpstreamRef = useRef(emitWorkspaceUpstream);

    useEffect(() => {
        emitWorkspaceUpstreamRef.current = emitWorkspaceUpstream;
    }, [emitWorkspaceUpstream]);

    const handleWorkspaceChange = useCallback((workspace: WorkspaceStateV2 | null) => {
        if (workspace) {
            setWorkspaceBridgeIfChanged(workspace);
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
    }, [emitWorkspaceUpstream, setWorkspaceBridgeIfChanged, usesWorkspaceShell]);

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

    const showLoadingMask = usesWorkspaceShell && (!toolHydrated || !ideReady);

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="relative h-full min-h-0 flex-1">
                <FullIDE
                    key={workspaceContextKey}
                    title={isSql ? "Run SQL" : "Run code"}
                    height={runnerH - 50}
                    fullHeight
                    language={toolLang}
                    access={{
                        hasUser: true,
                        canUseMultiFile: isSql || ideShell.access.canUseMultiFile,
                        canSaveCloud: ideShell.access.canSaveCloud,
                        canCreateProjects: ideShell.access.canCreateProjects,
                    }}
                    loginHref="/authenticate"
                    billingHref="/billing"
                    draftStorageMode="off"
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
                    externalWorkspace={usesWorkspaceShell ? null : workspaceBridge}
                    onWorkspaceChange={handleWorkspaceChange}
                    onBeforeRun={handleBeforeRun}
                    onRunResult={handleRunResult}
                    onReadyChange={setIdeReady}
                    initialSqlDialect={sqlDialect}
                    sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                />

                {showLoadingMask ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">
                        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/80">
                            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                            Loading editor...
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
