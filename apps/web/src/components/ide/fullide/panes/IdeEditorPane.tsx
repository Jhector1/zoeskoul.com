"use client";

import React from "react";
import CodeRunner from "@/components/code/CodeRunner";
import type { CodeRunnerRuntime } from "@/components/code/runner/runtime";

import TabsBar from "../TabsBar";
import { PANEL_CARD_CLASS } from "../../constants";
import { cn } from "../../utils";
import { exportProjectFiles } from "../../fsTree";

type Props = {
    panelRef: React.RefObject<HTMLDivElement | null>;
    nodes: any[];
    tabFiles: any[];
    activeFileId: string | null;
    activeFile: any | null;
    runnerHeight: number;
    title: string;
    isSql: boolean;
    language: any;
    sqlDialect: any;
    isAuthenticated: boolean;
    runtime: CodeRunnerRuntime;
    projectId?: string | null;
    onApplyTerminalSnapshotFiles?: (
        files: Array<{ path: string; content: string }>,
        meta: { dirtyUiPaths: Set<string> },
    ) => void | Promise<void>;
    onChangeLanguage: (language: any) => void;
    onChangeCode: (code: string) => void;
    onChangeSqlDialect: (dialect: any) => void;
    onRun: (args: any) => Promise<any>;
    setActiveFileId: (id: string | null) => void;
    closeTab: (id: string) => void;
    isDesktop: boolean;
};

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
                                          onApplyTerminalSnapshotFiles,
                                          onChangeLanguage,
                                          onChangeCode,
                                          onChangeSqlDialect,
                                          onRun,
                                          setActiveFileId,
                                          closeTab,
                                          isDesktop,
                                          isAuthenticated,
                                      }: Props) {
    const schemaSql = React.useMemo(() => {
        const file = nodes.find(
            (n: any) =>
                n?.kind === "file" && String(n?.name ?? "").toLowerCase() === "schema.sql",
        );
        return file?.content ?? "";
    }, [nodes]);

    const seedSql = React.useMemo(() => {
        const file = nodes.find(
            (n: any) =>
                n?.kind === "file" && String(n?.name ?? "").toLowerCase() === "seed.sql",
        );
        return file?.content ?? "";
    }, [nodes]);

    const workspaceTerminalFiles = React.useMemo(() => {
        return exportProjectFiles(nodes);
    }, [nodes]);

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className={PANEL_CARD_CLASS}>
                <TabsBar
                    nodes={nodes}
                    tabFiles={tabFiles}
                    activeFileId={activeFileId}
                    setActiveFileId={setActiveFileId}
                    closeTab={closeTab}
                />
            </div>

            <div ref={panelRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {activeFile ? (
                    <div className={cn("h-full overflow-hidden px-2 pt-2", PANEL_CARD_CLASS)}>
                        <CodeRunner
                            frame="plain"
                            title={isSql ? `SQL · ${title}` : title}
                            height={runnerHeight}
                            language={language}
                            onChangeLanguage={onChangeLanguage}
                            code={activeFile.content}
                            onChangeCode={onChangeCode}
                            sqlDialect={sqlDialect}
                            onChangeSqlDialect={onChangeSqlDialect}
                            sqlSchemaSql={schemaSql}
                            sqlSeedSql={seedSql}
                            showLanguagePicker={false}
                            showSqlDialectPicker
                            allowReset={isDesktop}
                            runtime={runtime}
                            allowRun
                            showEditorThemeToggle={false}
                            showTerminalDockToggle={isDesktop}
                            resetTerminalOnRun={true}
                            onRun={isAuthenticated ? onRun : undefined}
                            isAuthenticated={isAuthenticated}
                            workspaceTerminal={{
                                enabled: !isSql,
                                projectId: projectId ?? undefined,
                                cwd: "/workspace",
                                initialFiles: workspaceTerminalFiles,
                                getWorkspaceFiles: () => workspaceTerminalFiles,
                                onTerminalSnapshotFiles: onApplyTerminalSnapshotFiles,
                                lazy: true,
                                title: "Terminal",
                            }}
                            editorModelKey={activeFileId ?? "no-file"}
                        />
                    </div>
                ) : (
                    <div className="flex h-full min-h-[280px] items-center justify-center rounded-none border border-dashed border-neutral-300 bg-white p-6 text-sm font-extrabold text-neutral-600 sm:rounded-xl dark:border-white/10 dark:bg-black/30 dark:text-white/70">
                        {isSql ? "No SQL file selected." : "No file selected."}
                    </div>
                )}
            </div>
        </div>
    );
}