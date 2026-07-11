"use client";

import React from "react";
import { useTranslations } from "next-intl";
import CodeRunner from "@/components/code/CodeRunner";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import {
    resolveTerminalWorkspaceKey,
    type CodeRunnerRuntime,
} from "@/components/code/runner/runtime";
import type { FullIDEServices } from "@/components/ide/fullide/services";

import TabsBar from "../TabsBar";
import { PANEL_CARD_CLASS } from "../../constants";
import { cn } from "../../utils";
import { exportWorkspaceEntries } from "../../fsTree";

type Props = {
    panelRef: React.RefObject<HTMLDivElement | null>;
    nodes: any[];
    tabFiles: any[];
    activeFileId: string | null;
    activeFile: any | null;
    runnerHeight: number | "auto";
    title: string;
    isSql: boolean;
    language: any;
    sqlDialect: any;
    isAuthenticated: boolean;
    runtime: CodeRunnerRuntime;
    projectId?: string | null;
    exerciseStateKey?: string;
    terminalHistoryScopeKey?: string;
    onApplyTerminalSnapshotFiles?: (
        files: Array<
            | { kind?: "file"; path: string; content: string }
            | { kind: "directory"; path: string }
        >,
        meta: { dirtyUiPaths: Set<string> },
    ) => void | Promise<void>;
    onTerminalEvidenceChange?: (evidence: import("@/lib/practice/types").TerminalEvidence) => void;
    onTerminalSyncReady?: (sync: (() => Promise<boolean>) | null) => void;
    onChangeLanguage: (language: any) => void;
    onChangeFileCode: (fileId: string, code: string) => void;
    onChangeSqlDialect: (dialect: any) => void;
    onBeforeRun?: () => void | Promise<void>;
    onRunResult?: (args: { result: any; runArgs: any }) => void;
    onRun: (args: any) => Promise<any>;
    setActiveFileId: (id: string | null) => void;
    workspaceFileSelectionVersion: number;
    closeTab: (id: string) => void;
    isDesktop: boolean;

    services: FullIDEServices;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: import("@/components/code/runner/components/sql/results-pane").SqlPaneOptions;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
};

function resolveEditorLanguage(workspaceLanguage: string, fileName?: string | null) {
    const lower = String(fileName ?? "").toLowerCase();

    if (workspaceLanguage === "web") {
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
        if (lower.endsWith(".css")) return "css";
        if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
            return "javascript";
        }
        if (lower.endsWith(".json")) return "json";
        return "html";
    }

    return workspaceLanguage;
}

export default function IdeEditorPane({
                                          panelRef,
                                          nodes,
                                          tabFiles,
                                          activeFileId,
                                          activeFile,
                                          runnerHeight,
                                          title,
                                          isSql,
                                          language,
                                          sqlDialect,
                                          runtime,
                                          projectId,
    exerciseStateKey,
                                          terminalHistoryScopeKey,
                                          onApplyTerminalSnapshotFiles,
                                          onChangeLanguage,
                                          onChangeFileCode,
                                          onChangeSqlDialect,
                                          onBeforeRun,
                                          onRunResult,
                                          onRun,
                                          setActiveFileId,
                                          workspaceFileSelectionVersion,
                                          closeTab,
                                          isDesktop,
                                          isAuthenticated,
                                          services,
                                          sqlDatasetId,
                                          sqlResultShape,
                                          sqlPaneOptions,
                                          sqlSchemaSql,
                                          sqlSeedSql,
                                          sqlSetupSql,
                                          sqlInitialTableSnapshots,
                                          onTerminalEvidenceChange,
                                      onTerminalSyncReady
                                      }: Props) {
    const t = useTranslations("ide.editor");
    const terminalT = useTranslations("ide.terminal");
    const isWeb = language === "web";
    const terminalWorkspaceOnly =
        services.editor.showEditor === false &&
        services.runner.enableWorkspaceTerminal &&
        !isSql &&
        !isWeb;

    const schemaSql = React.useMemo(() => {
        const file = nodes.find(
            (n: any) =>
                n?.kind === "file" && String(n?.name ?? "").toLowerCase() === "schema.sql",
        );
        return file?.content ?? sqlSchemaSql ?? sqlSetupSql ?? "";
    }, [nodes, sqlSchemaSql, sqlSetupSql]);

    const seedSql = React.useMemo(() => {
        const file = nodes.find(
            (n: any) =>
                n?.kind === "file" && String(n?.name ?? "").toLowerCase() === "seed.sql",
        );
        return file?.content ?? sqlSeedSql ?? "";
    }, [nodes, sqlSeedSql]);

    const workspaceEntries = React.useMemo(() => {
        return exportWorkspaceEntries(nodes);
    }, [nodes]);

    const editorLanguage = React.useMemo(
        () => resolveEditorLanguage(language, activeFile?.name ?? null),
        [language, activeFile?.name],
    );
    const handleBoundCodeChange = React.useCallback(
        (nextCode: string) => {
            const fileId = String(activeFile?.id ?? activeFileId ?? "");

            if (!fileId) {
                return;
            }

            onChangeFileCode(fileId, nextCode);
        },
        [activeFile?.id, activeFileId, onChangeFileCode],
    );
    const terminalWorkspaceKey = React.useMemo(
        () =>
            resolveTerminalWorkspaceKey({
                exerciseStateKey,
                terminalHistoryScopeKey,
                projectId,
                terminalSessionScope: services.runner.terminalSessionScope,
                terminalCwd: services.runner.terminalCwd,
            }),
        [
            exerciseStateKey,
            terminalHistoryScopeKey,
            projectId,
            services.runner.terminalSessionScope,
            services.runner.terminalCwd,
        ],
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {services.editor.showTabs ? (
                <div className={PANEL_CARD_CLASS}>
                    <TabsBar
                        nodes={nodes}
                        tabFiles={tabFiles}
                        activeFileId={activeFileId}
                        setActiveFileId={setActiveFileId}
                        closeTab={closeTab}
                    />
                </div>
            ) : null}

            <div ref={panelRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {process.env.NODE_ENV !== "production" && activeFile ? (
                    <textarea
                        data-testid="fullide-editor-e2e-input"
                        aria-label={t("e2eInputLabel")}
                        value={activeFile.content ?? ""}
                        onChange={(e) => handleBoundCodeChange(e.target.value)}
                        style={{
                            position: "absolute",
                            width: 1,
                            height: 1,
                            opacity: 0,
                            pointerEvents: "auto",
                        }}
                    />
                ) : null}

                {activeFile || terminalWorkspaceOnly ? (
                    <div className={cn("h-full overflow-hidden  pt-2", PANEL_CARD_CLASS)}>
                        <CodeRunner
                            frame="plain"
                            title={isSql ? `SQL · ${title}` : isWeb ? `Web · ${title}` : title}
                            height={runnerHeight}
                            language={language}
                            editorLanguage={editorLanguage}
                            onChangeLanguage={onChangeLanguage}
                            code={activeFile?.content ?? ""}
                            onChangeCode={handleBoundCodeChange}
                            sqlDialect={sqlDialect}
                            onChangeSqlDialect={onChangeSqlDialect}
                            sqlDatasetId={sqlDatasetId}
                            sqlResultShape={sqlResultShape}
                            sqlPaneOptions={sqlPaneOptions}
                            sqlSchemaSql={schemaSql}
                            sqlSeedSql={seedSql}
                            sqlSetupSql={sqlSetupSql}
                            sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                            showLanguagePicker={false}
                            showSqlDialectPicker={services.runner.showSqlDialectPicker}
                            allowReset={isDesktop && !learnerUiFlags.compactLearnerUi}
                            allowRun={services.runner.allowRun && !isWeb}
                            runtime={runtime}
                            showTerminal={services.runner.showTerminal}
                            showEditorThemeToggle={services.runner.showThemeToggle}
                            showTerminalDockToggle={
                                services.runner.showTerminalDockToggle && isDesktop
                            }
                            showOpenTerminalButton={
                                services.runner.showOpenTerminalButton && isDesktop
                            }
                            showRestartTerminalButton={
                                services.runner.showRestartTerminalButton && isDesktop
                            }
                            resetTerminalOnRun={!terminalWorkspaceOnly}
                            exerciseStateKey={exerciseStateKey}
                            editorModelKey={
                                exerciseStateKey
                                    ? `${exerciseStateKey}:${activeFileId ?? "no-file"}`
                                    : activeFileId ?? "no-file"
                            }
                            showEditor={services.editor.showEditor !== false}
                            activeWorkspaceFileId={activeFile?.id ?? activeFileId ?? undefined}
                            workspaceFileSelectionVersion={workspaceFileSelectionVersion}
                            onBeforeRun={onBeforeRun}
                            onRun={
                                isAuthenticated && !isWeb
                                    ? async (runArgs: any) => {
                                          const result = await onRun(runArgs);
                                          onRunResult?.({ result, runArgs });
                                          return result;
                                      }
                                    : undefined
                            }
                            isAuthenticated={isAuthenticated}
                            webPreviewEntries={workspaceEntries}
                            workspaceTerminal={
                                !isSql && !isWeb
                                    ? {
                                        enabled: services.runner.enableWorkspaceTerminal,
                                        projectId: projectId ?? undefined,
                                        cwd: services.runner.terminalCwd ?? "/workspace",
                                        // Keep the visible exercise binding unchanged while
                                        // allowing PTY reuse to widen to topic/module scope.
                                        workspaceKey: terminalWorkspaceKey,
                                        terminalSessionScope:
                                            services.runner.terminalSessionScope,
                                        initialFiles: workspaceEntries,
                                        getWorkspaceFiles: () => workspaceEntries,
                                        onTerminalSnapshotFiles: onApplyTerminalSnapshotFiles,
                                        lazy: true,
                                        title: terminalT("title"),
                                        historyScopeKey: terminalHistoryScopeKey,
                                    }
                                    : undefined
                            }
                            onTerminalEvidenceChange={onTerminalEvidenceChange}
                            onTerminalSyncReady={onTerminalSyncReady}

                        />
                    </div>
                ) : (
                    <div className="flex h-full min-h-[280px] items-center justify-center rounded-none border border-dashed border-neutral-300 bg-white p-6 text-sm font-extrabold text-neutral-600 sm:rounded-xl dark:border-white/10 dark:bg-black/30 dark:text-white/70">
                        {isSql ? t("emptyState.noSqlFile") : isWeb ? t("emptyState.noWebFile") : t("emptyState.noFile")}
                    </div>
                )}
            </div>
        </div>
    );
}
