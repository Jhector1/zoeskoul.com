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

export default function CodeToolPane(props: {
    height: number;
    toolLang: RunnerLanguage;
    toolCode: string;
    toolStdin: string;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onBeforeRun?: () => void | Promise<void>;
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
        onChangeCode,
        onChangeStdin,
        onBeforeRun,
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
    const runnerH = Math.max(320, size.h);
    const isSql = toolLang === "sql";

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
                title={isSql ? "Run SQL" : "Run code"}
                height={runnerH - 50}
                fullHeight
                language={toolLang}
                access={{
                    hasUser: true,
                    canUseMultiFile: isSql,
                    canSaveCloud: false,
                    canCreateProjects: false,
                }}
                loginHref="/authenticate"
                billingHref="/billing"
                draftStorageMode="off"
                servicePreset="runner"
                services={{
                    runner: {
                        showThemeToggle: true,
                        showSqlDialectPicker: false,
                    },
                }}
                initialWorkspace={externalWorkspace}
                externalWorkspace={externalWorkspace}
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
