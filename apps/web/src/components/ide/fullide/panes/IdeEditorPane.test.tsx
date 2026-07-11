import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import IdeEditorPane from "@/components/ide/fullide/panes/IdeEditorPane";

const capturedRunnerProps: any[] = [];

vi.mock("next-intl", () => ({
    useTranslations:
        (namespace?: string) =>
        (key: string) =>
            namespace ? `${namespace}.${key}` : key,
}));

vi.mock("@/components/code/CodeRunner", () => ({
    default: (props: any) => {
        capturedRunnerProps.push(props);
        return <div data-testid="mock-code-runner" />;
    },
}));

vi.mock("@/components/ide/fullide/TabsBar", () => ({
    default: () => <div data-testid="mock-tabs-bar" />,
}));

describe("IdeEditorPane", () => {
    it("keeps terminal_workspace lessons mounted without an active file", () => {
        capturedRunnerProps.length = 0;

        const html = renderToStaticMarkup(
            <IdeEditorPane
                panelRef={{ current: null }}
                nodes={[]}
                tabFiles={[]}
                activeFileId={null}
                activeFile={null}
                runnerHeight={320}
                title="Linux terminal"
                isSql={false}
                language="bash"
                sqlDialect="postgres"
                isAuthenticated
                runtime={{ backend: "pty" } as any}
                services={{
                    chrome: {
                        showHeader: false,
                        showBackButton: false,
                        showLessonLink: false,
                        showActivePath: false,
                        showStatus: false,
                        showTopLanguageButtons: false,
                    },
                    explorer: {
                        enabled: false,
                        allowMobileDrawer: false,
                        allowResize: false,
                        showFilter: false,
                        showActions: false,
                        showHistoryControls: false,
                        showFooter: false,
                        showStdin: false,
                        fileActions: {
                            enabled: false,
                            createFile: false,
                            createFolder: false,
                            rename: false,
                            delete: false,
                            dragDrop: false,
                        },
                    },
                    editor: {
                        showTabs: false,
                        showEditor: false,
                    },
                    runner: {
                        allowRun: false,
                        showTerminal: true,
                        showTerminalDockToggle: false,
                        showOpenTerminalButton: true,
                        showRestartTerminalButton: true,
                        showThemeToggle: true,
                        showSqlDialectPicker: false,
                        enableWorkspaceTerminal: true,
                        terminalSessionScope: "exercise",
                    },
                    projects: {
                        showProjectSwitcher: false,
                        showCloudProjects: false,
                        showSaveControls: false,
                        showSaveAs: false,
                    },
                }}
                onChangeLanguage={vi.fn()}
                onChangeFileCode={vi.fn()}
                onChangeSqlDialect={vi.fn()}
                onRun={vi.fn(async () => null)}
                setActiveFileId={vi.fn()}
                workspaceFileSelectionVersion={0}
                closeTab={vi.fn()}
                isDesktop
            />,
        );

        expect(html).toContain('data-testid="mock-code-runner"');
        expect(capturedRunnerProps).toHaveLength(1);
        expect(capturedRunnerProps[0]?.showEditor).toBe(false);
        expect(capturedRunnerProps[0]?.resetTerminalOnRun).toBe(false);
        expect(capturedRunnerProps[0]?.code).toBe("");
    });
});
