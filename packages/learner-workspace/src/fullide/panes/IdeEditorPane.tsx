"use client";

import { getLearnerWorkspaceEnv, getLearnerWorkspaceStaticConfig } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import React from "react";
import { useLearnerWorkspaceTranslations as useTranslations } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import { deriveManifestTerminalBootstrap } from "@zoeskoul/curriculum-contracts";
import CodeRunner from "@zoeskoul/learner-workspace/runner/CodeRunner";
import { learnerUiFlags } from "@zoeskoul/learner-workspace/lib/config/learnerUiFlags";
import {
    resolveTerminalWorkspaceKey,
    workspaceTerminalBootstrapKey,
    type CodeRunnerRuntime,
} from "@zoeskoul/learner-workspace/runner/runtime";
import type { FullIDEServices } from "@zoeskoul/learner-workspace/ide/fullide/services";
import type { FileNode, WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { EditorSplitPlacement } from "@zoeskoul/learner-workspace/runner/types";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { resolveWorkspaceEditorLanguage } from "@zoeskoul/code-contracts";
import { isBinaryFileNode } from "@zoeskoul/learner-workspace/lib/ide/workspaceFileContent";

import TabsBar from "@zoeskoul/learner-workspace/fullide/TabsBar";
import MathMarkdown from "@zoeskoul/learner-workspace/ui/markdown/MathMarkdown";
import { PANEL_CARD_CLASS } from "@zoeskoul/learner-workspace/ide/constants";
import { cn } from "@zoeskoul/learner-workspace/ide/utils";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";

type Props = {
    panelRef: React.RefObject<HTMLDivElement | null>;
    nodes: import("@zoeskoul/learner-workspace/ide/types").FSNode[];
    tabFiles: FileNode[];
    activeFileId: string | null;
    activeFile: FileNode | null;
    splitFile?: FileNode | null;
    splitPlacement?: EditorSplitPlacement | null;
    onOpenFileInSplit?: (
        id: string,
        placement: EditorSplitPlacement,
    ) => void;
    onCloseSplit?: () => void;
    runnerHeight: number | "auto";
    title: string;
    isSql: boolean;
    language: any;
    sqlDialect: any;
    isAuthenticated: boolean;
    runtime: CodeRunnerRuntime;
    projectId?: string | null;
    exerciseStateKey?: string;
    workspace: WorkspaceStateV2 | null;
    workspaceReplacementRevision?: string | number;
    onWorkspaceReplacementApplied?: (revision: string | number) => void;
    /** Umbrella browser-local learner-state persistence policy. */
    draftStorageMode?: "off" | "local";
    readOnly?: boolean;
    terminalHistoryScopeKey?: string;
    onApplyTerminalSnapshotFiles?: (
        files: WorkspaceSyncEntry[],
        meta: {
            dirtyUiPaths: Set<string>;
            baselinePaths?: Set<string>;
        },
    ) => void | Promise<void>;
    onTerminalEvidenceChange?: (evidence: import("@zoeskoul/learner-workspace/contracts/practiceTypes").TerminalEvidence) => void;
    onTerminalSyncReady?: (sync: (() => Promise<boolean>) | null) => void;
    fileSyncMode?: "v5" | "v6";
    onV6ExplorerExecutorReady?: import("@zoeskoul/learner-workspace/runner/runtime").WorkspaceTerminalConfig["onV6ExplorerExecutorReady"];
    onChangeLanguage: (language: any) => void;
    onChangeFileCode: (fileId: string, code: string) => void;
    onChangeSqlDialect: (dialect: any) => void;
    onBeforeRun?: () => void | Promise<void>;
    onRunResult?: (args: { result: any; runArgs: any }) => void;
    remoteWebPreview?: RemoteWebPreviewDescriptor;
    remoteWebPreviewSurface?: React.ReactNode;
    webPreviewCommerceRequest?: import("@zoeskoul/learner-workspace/ide/types").FullIDEProps["webPreviewCommerceRequest"];
    webPreviewSessionKey?: string;
    onRun: (args: any) => Promise<any>;
    setActiveFileId: (id: string | null) => void;
    workspaceFileSelectionVersion: number;
    closeTab: (id: string) => void;
    isDesktop: boolean;

    services: FullIDEServices;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: import("@zoeskoul/learner-workspace/runner/components/sql/results-pane/index").SqlPaneOptions;
    runnerPaneOptions?: import("@zoeskoul/curriculum-contracts").ToolRunnerPanePolicy;
    defaultSurface?: import("@zoeskoul/curriculum-contracts").ToolSurface;
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

export default function IdeEditorPane({
    panelRef,
    nodes,
    tabFiles,
    activeFileId,
    activeFile,
    splitFile = null,
    splitPlacement = null,
    onOpenFileInSplit,
    onCloseSplit,
    runnerHeight,
    title,
    isSql,
    language,
    sqlDialect,
    runtime,
    projectId,
    exerciseStateKey,
    workspace,
    workspaceReplacementRevision,
    onWorkspaceReplacementApplied,
    draftStorageMode = "local",
    readOnly = false,
    terminalHistoryScopeKey,
    onApplyTerminalSnapshotFiles,
    onChangeLanguage,
    onChangeFileCode,
    onChangeSqlDialect,
    onBeforeRun,
    onRunResult,
    remoteWebPreview,
    remoteWebPreviewSurface,
    webPreviewCommerceRequest,
    webPreviewSessionKey,
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
    runnerPaneOptions,
    defaultSurface,
    sqlSchemaSql,
    sqlSeedSql,
    sqlSetupSql,
    sqlInitialTableSnapshots,
    onTerminalEvidenceChange,
    onTerminalSyncReady,
    fileSyncMode = "v5",
    onV6ExplorerExecutorReady,
}: Props) {
    const t = useTranslations("ide.editor");
    const terminalT = useTranslations("ide.terminal");
    const isWeb = language === "web";
    const isMarkdown = !!activeFile && !isBinaryFileNode(activeFile) && /(?:\.md(?:own)?$|^readme$)/i.test(activeFile.name);
    const [markdownPreview, setMarkdownPreview] = React.useState(true);
    React.useEffect(() => { setMarkdownPreview(true); }, [activeFile?.id]);
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
        return file?.kind === "file" && !isBinaryFileNode(file)
            ? file.content ?? sqlSchemaSql ?? sqlSetupSql ?? ""
            : sqlSchemaSql ?? sqlSetupSql ?? "";
    }, [nodes, sqlSchemaSql, sqlSetupSql]);

    const seedSql = React.useMemo(() => {
        const file = nodes.find(
            (n: any) =>
                n?.kind === "file" && String(n?.name ?? "").toLowerCase() === "seed.sql",
        );
        return file?.kind === "file" && !isBinaryFileNode(file)
            ? file.content ?? sqlSeedSql ?? ""
            : sqlSeedSql ?? "";
    }, [nodes, sqlSeedSql]);

    const workspaceEntries = React.useMemo(() => {
        return exportWorkspaceEntries(nodes);
    }, [nodes]);
    const terminalBootstrap = React.useMemo(
        () =>
            deriveManifestTerminalBootstrap({
                bootstrap: services.runner.terminalBootstrap,
                terminalCwd: services.runner.terminalCwd ?? "/workspace",
                files: workspaceEntries,
            }),
        [
            services.runner.terminalBootstrap,
            services.runner.terminalCwd,
            workspaceEntries,
        ],
    );

    const editorLanguage = React.useMemo(
        () =>
            activeFile
                ? resolveWorkspaceEditorLanguage(activeFile.name, String(language))
                : String(language),
        [activeFile?.name, language],
    );
    const handleBoundCodeChange = React.useCallback(
        (nextCode: string) => {
            if (readOnly || isBinaryFileNode(activeFile)) return;

            const fileId = String(activeFile?.id ?? activeFileId ?? "");

            if (!fileId) {
                return;
            }

            onChangeFileCode(fileId, nextCode);
        },
        [activeFile?.binary, activeFile?.id, activeFileId, onChangeFileCode, readOnly],
    );
    const terminalWorkspaceKey = React.useMemo(
        () =>
            resolveTerminalWorkspaceKey({
                exerciseStateKey,
                terminalHistoryScopeKey,
                projectId,
                terminalSessionScope: services.runner.terminalSessionScope,
                terminalCwd: services.runner.terminalCwd,
                terminalBootstrapKey: workspaceTerminalBootstrapKey(
                    terminalBootstrap,
                ),
            }),
        [
            exerciseStateKey,
            terminalHistoryScopeKey,
            projectId,
            services.runner.terminalSessionScope,
            services.runner.terminalCwd,
            terminalBootstrap,
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
                        openFileInSplit={onOpenFileInSplit}
                    />
                </div>
            ) : null}

            <div ref={panelRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {getLearnerWorkspaceStaticConfig().nodeEnv !== "production" &&
                activeFile &&
                !isBinaryFileNode(activeFile) ? (
                    <textarea
                        data-testid="fullide-editor-e2e-input"
                        aria-label={t("e2eInputLabel")}
                        value={activeFile.content ?? ""}
                        readOnly={readOnly}
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
                    <div className={cn("relative h-full overflow-hidden pt-2", PANEL_CARD_CLASS)}>
                        <CodeRunner
                            frame="plain"
                            title={
                                isSql ? `SQL · ${title}` : isWeb ? `Web · ${title}` : title
                            }
                            height={runnerHeight}
                            language={language}
                            editorLanguage={editorLanguage}
                            onChangeLanguage={onChangeLanguage}
                            code={
                                isBinaryFileNode(activeFile)
                                    ? ""
                                    : activeFile?.content ?? ""
                            }
                            onChangeCode={handleBoundCodeChange}
                            editorToolbar={isMarkdown ? (
                                <div role="group" aria-label="Markdown view" className="flex gap-0.5 rounded-md border border-neutral-200 bg-white/95 p-0.5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
                                    <button type="button" onClick={() => setMarkdownPreview(true)} aria-pressed={markdownPreview}
                                        className={`rounded px-2.5 py-1 text-xs font-medium ${markdownPreview ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-50" : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}>Preview</button>
                                    <button type="button" onClick={() => setMarkdownPreview(false)} aria-pressed={!markdownPreview}
                                        className={`rounded px-2.5 py-1 text-xs font-medium ${!markdownPreview ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-50" : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}>Code</button>
                                </div>
                            ) : undefined}
                            editorOverlay={isMarkdown && markdownPreview ? (
                                <div className="v6-readme-preview h-full min-h-0 overflow-y-auto bg-white px-5 pb-8 pt-14 text-sm text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 sm:px-7" role="region" aria-label={`Markdown preview of ${activeFile?.name ?? "file"}`}>
<style>{`
                                    .v6-readme-preview .zoe-lesson-markdown { max-width: 62rem; margin: 0 auto; font-size: 0.875rem; line-height: 1.65; }
                                    .v6-readme-preview :is(pre, .zoe-code-frame) { border-radius: 7px; box-shadow: none; }
                                    .v6-readme-preview .zoe-code-frame { background: #f8fafc; color: #334155; border: 1px solid #e2e8f0; border-radius: 7px; box-shadow: none; margin: .85rem 0; }
                                    .v6-readme-preview .zoe-code-toolbar { min-height: 2.05rem; padding: .2rem .55rem .2rem .75rem; border-bottom-color: #e2e8f0; }
                                    .v6-readme-preview .zoe-code-language { color: #64748b; font-size: .67rem; font-weight: 600; letter-spacing: .04em; }
                                    .v6-readme-preview .zoe-code-copy { color: #475569; border-color: #cbd5e1; background: #fff; border-radius: 5px; font-size: .7rem; padding: .25rem .45rem; }
                                    .v6-readme-preview .zoe-code-copy:hover { color: #0f172a; background: #e2e8f0; }
                                    .v6-readme-preview .zoe-code-frame pre { color: #334155; font-size: .775rem; line-height: 1.55; padding: .72rem .85rem; }
                                    .v6-readme-preview .zoe-code-frame :is(code, code.hljs) { color: inherit; }
                                    :is(.dark, [data-theme="dark"]) .v6-readme-preview .zoe-code-frame { background: #111827; color: #e5e7eb; border-color: #374151; }
                                    :is(.dark, [data-theme="dark"]) .v6-readme-preview .zoe-code-toolbar { border-bottom-color: #374151; }
                                    :is(.dark, [data-theme="dark"]) .v6-readme-preview .zoe-code-language { color: #9ca3af; }
                                    :is(.dark, [data-theme="dark"]) .v6-readme-preview .zoe-code-copy { color: #d1d5db; background: #1f2937; border-color: #4b5563; }
                                    :is(.dark, [data-theme="dark"]) .v6-readme-preview .zoe-code-copy:hover { background: #374151; color: #fff; }
                                    :is(.dark, [data-theme="dark"]) .v6-readme-preview .zoe-code-frame pre { color: #e5e7eb; }
                                `}</style>
                                    <MathMarkdown content={activeFile?.content ?? ""} />
                                </div>
                            ) : undefined}
                            activeBinaryFile={
                                isBinaryFileNode(activeFile)
                                    ? {
                                          name: activeFile.name,
                                          binary: activeFile.binary,
                                      }
                                    : null
                            }
                            splitEditor={
                                splitFile && splitPlacement
                                    ? {
                                          placement: splitPlacement,
                                          fileId: splitFile.id,
                                          fileName: splitFile.name,
                                          editorLanguage: resolveWorkspaceEditorLanguage(
                                              splitFile.name,
                                              String(language),
                                          ),
                                          code: isBinaryFileNode(splitFile)
                                              ? ""
                                              : splitFile.content ?? "",
                                          binary: isBinaryFileNode(splitFile)
                                              ? splitFile.binary
                                              : null,
                                          onChangeCode: (nextCode: string) => {
                                              if (readOnly || isBinaryFileNode(splitFile)) {
                                                  return;
                                              }
                                              onChangeFileCode(splitFile.id, nextCode);
                                          },
                                          readOnly,
                                      }
                                    : null
                            }
                            onCloseSplitEditor={onCloseSplit}
                            sqlDialect={sqlDialect}
                            onChangeSqlDialect={onChangeSqlDialect}
                            sqlDatasetId={sqlDatasetId}
                            sqlResultShape={sqlResultShape}
                            sqlPaneOptions={sqlPaneOptions}
                            runnerPaneOptions={runnerPaneOptions}
                            initialTerminalDock={services.runner.initialTerminalDock}
                            defaultSurface={defaultSurface}
                            sqlSchemaSql={schemaSql}
                            sqlSeedSql={seedSql}
                            sqlSetupSql={sqlSetupSql}
                            sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                            showLanguagePicker={false}
                            showRestartTerminalButton={false}

                            showSqlDialectPicker={services.runner.showSqlDialectPicker}
                            allowReset={
                                !readOnly && isDesktop && !learnerUiFlags.compactLearnerUi
                            }
                            allowRun={
                                services.runner.allowRun &&
                                !isWeb &&
                                !isBinaryFileNode(activeFile)
                            }
                            runtime={runtime}
                            readOnly={readOnly}
                            showTerminal={services.runner.showTerminal}
                            showEditorThemeToggle={services.runner.showThemeToggle}
                            showTerminalDockToggle={
                                services.runner.showTerminalDockToggle && isDesktop
                            }
                            showOpenTerminalButton={
                                services.runner.showOpenTerminalButton && isDesktop
                            }
                            // showRestartTerminalButton={
                            //     services.runner.showRestartTerminalButton && isDesktop
                            // }
                            resetTerminalOnRun={!terminalWorkspaceOnly}
                            exerciseStateKey={exerciseStateKey}
                            workspace={workspace}
                            workspaceReplacementRevision={
                                workspaceReplacementRevision
                            }
                            onWorkspaceReplacementApplied={
                                onWorkspaceReplacementApplied
                            }
                            draftStorageMode={draftStorageMode}
                            editorModelKey={
                                exerciseStateKey
                                    ? `${exerciseStateKey}:${activeFileId ?? "no-file"}`
                                    : activeFileId ?? "no-file"
                            }
                            showEditor={services.editor.showEditor !== false}
                            activeWorkspaceFileId={
                                activeFile?.id ?? activeFileId ?? undefined
                            }
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
                            remoteWebPreview={remoteWebPreview}
                            remoteWebPreviewSurface={remoteWebPreviewSurface}
                            webPreviewCommerceRequest={webPreviewCommerceRequest}
                            webPreviewSessionKey={webPreviewSessionKey}
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
                                        bootstrap: terminalBootstrap,
                                        initialFiles: workspaceEntries,
                                        getWorkspaceFiles: () => workspaceEntries,
                                        onTerminalSnapshotFiles:
                                            onApplyTerminalSnapshotFiles,
                                        fileSyncMode,
                                        onV6ExplorerExecutorReady,
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
                        {isSql
                            ? t("emptyState.noSqlFile")
                            : isWeb
                              ? t("emptyState.noWebFile")
                              : t("emptyState.noFile")}
                    </div>
                )}
            </div>
        </div>
    );
}
