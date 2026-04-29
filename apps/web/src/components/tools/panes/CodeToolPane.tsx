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
                boundId: boundId ?? "unbound",
                language: toolLang,
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
                workspaceShell: usesWorkspaceShell,
            }),
        [boundId, sqlSchemaSql, sqlSeedSql, sqlSetupSql, toolLang, usesWorkspaceShell],
    );
    const runnerH = Math.max(usesWorkspaceShell ? 480 : 320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);
    const lastEmittedRef = useRef<{ code: string; stdin: string } | null>(null);
    const lastIncomingRef = useRef<{ code: string; stdin: string } | null>(null);
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
    const [workspaceBridge, setWorkspaceBridge] = useState<WorkspaceStateV2>(
        toolWorkspace ?? externalWorkspace,
    );
    const lastContextKeyRef = useRef<string>("");

    useEffect(() => {
        if (lastContextKeyRef.current !== workspaceContextKey) {
            lastContextKeyRef.current = workspaceContextKey;
            setWorkspaceBridge(toolWorkspace ?? externalWorkspace);
            lastEmittedRef.current = null;
            return;
        }

        if (!usesWorkspaceShell) {
            setWorkspaceBridge(externalWorkspace);
            return;
        }

        if (toolWorkspace) {
            setWorkspaceBridge(toolWorkspace);
            return;
        }

        setWorkspaceBridge((prev) => {
            const prevSnapshot = extractWorkspaceSnapshot(prev);
            if (prevSnapshot.code === toolCode && prevSnapshot.stdin === toolStdin) {
                return patchToolWorkspaceSource({
                    workspace: prev,
                    language: toolLang,
                    code: toolCode,
                    stdin: toolStdin,
                    sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                    sqlSeedSql: sqlSeedSql ?? "",
                });
            }

            return prev;
        });
    }, [
        boundId,
        externalWorkspace,
        toolWorkspace,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        toolCode,
        toolLang,
        toolStdin,
        usesWorkspaceShell,
        workspaceContextKey,
    ]);

    useEffect(() => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
    }, [toolLang, toolCode, toolStdin, boundId, clearRunFeedback]);

    useEffect(() => {
        lastIncomingRef.current = {
            code: toolCode,
            stdin: toolStdin,
        };
    }, [toolCode, toolStdin]);

    const handleWorkspaceChange = useCallback((workspace: WorkspaceStateV2 | null) => {
        if (workspace) {
            setWorkspaceBridge(workspace);
        }
        onChangeWorkspace?.(workspace);

        const next = extractWorkspaceSnapshot(workspace);
        const prevEmitted = lastEmittedRef.current;
        const prevIncoming = lastIncomingRef.current;

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

        if (boundId) {
            syncCodeInputSnapshot?.(boundId, {
                code: next.code,
                codeStdin: next.stdin,
                submitted: false,
                result: null,
            });
        }
    }, [
        boundId,
        clearRunFeedback,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        syncCodeInputSnapshot,
    ]);

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

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
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
                initialSqlDialect={sqlDialect}
                sqlInitialTableSnapshots={sqlInitialTableSnapshots}
            />

            {!isSql && runFeedback ? (
                <div className="mt-3">
                    <CodeFeedbackCallout feedback={runFeedback} />
                </div>
            ) : null}
        </div>
    );
}
