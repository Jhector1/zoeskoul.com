import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CodeRunner, {
    restartWorkspaceTerminalSession,
} from "@/components/code/runner/CodeRunner";

const mockedWorkspaceTerminalControllerCalls: any[] = [];

vi.mock("next-themes", () => ({
    useTheme: () => ({
        resolvedTheme: "dark",
    }),
}));

vi.mock("@/components/markdown/MathMarkdown", () => ({
    default: () => null,
}));

vi.mock("@/components/code/runner/components/EditorPane", () => ({
    default: () => <div data-testid="mock-editor-pane" />,
}));

vi.mock("@/components/code/runner/components/OutputSurface", () => ({
    default: () => <div data-testid="mock-output-surface" />,
}));

vi.mock("@/components/code/runner/components/XtermTerminal", () => ({
    default: () => <div data-testid="mock-xterm-terminal" />,
}));

vi.mock("@/components/code/runner/hooks/useSplitSizing", () => ({
    useSplitSizing: () => ({
        mainH: 320,
        bottomEditorH: 160,
        bottomTermH: 160,
        rightTotalH: 320,
        termW: 240,
        separatorProps: {},
        onPointerDownSplit: vi.fn(),
    }),
}));

vi.mock("@/components/code/runner/hooks/controller/useCodeRunnerController", () => ({
    useCodeRunnerController: () => ({
        busy: false,
        runState: "idle",
        lastResult: null,
        cancelRun: vi.fn(),
        resetTerminal: vi.fn(),
        startRun: vi.fn(),
    }),
}));

vi.mock("@/components/code/runner/hooks/controller/useResolvedRuntime", () => ({
    resolveRuntime: (runtime: unknown) => runtime,
}));

vi.mock("@/components/code/runner/hooks/pty/useWorkspaceTerminalController", () => ({
    useWorkspaceTerminalController: (args: any) => {
        mockedWorkspaceTerminalControllerCalls.push(args);
        return {
            available: true,
            terminalFeed: [],
            terminalEvidence: { commands: [], outputText: "" },
            inputEnabled: true,
            busy: false,
            syncStatus: "idle",
            sendData: vi.fn(),
            resize: vi.fn(),
            beforeSubmitEnter: vi.fn(),
            afterSubmitEnter: vi.fn(),
            sessionId: "session-1",
            started: true,
            starting: false,
            state: "ready",
            open: vi.fn(),
            stop: vi.fn(),
            reset: vi.fn(),
            replaceFiles: vi.fn(),
            snapshotFiles: vi.fn(),
        };
    },
}));

describe("CodeRunner terminal-only mode", () => {
    beforeEach(() => {
        mockedWorkspaceTerminalControllerCalls.length = 0;
    });

    it("renders terminal-only workspace mode without editor or tab switcher", () => {
        const html = renderToStaticMarkup(
            <CodeRunner
                language="python"
                code="print('hi')"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{ enabled: true }}
                isAuthenticated
                editorTestId="editor-pane"
                outputTestId="output-pane"
                showHeaderBar={false}
            />,
        );

        expect(html).toContain('data-testid="output-pane"');
        expect(html).toContain('data-testid="mock-xterm-terminal"');
        expect(html).not.toContain('data-testid="mock-output-surface"');
        expect(html).not.toContain('data-testid="editor-pane"');
        expect(html).not.toContain('data-testid="mock-editor-pane"');
        expect(html).not.toContain("aria-pressed");
        expect(html).not.toContain(">Output<");
        expect(html).not.toContain(">Terminal<");
    });

    it("keeps terminal selected for terminal-only mode across exercise identities", () => {
        const first = renderToStaticMarkup(
            <CodeRunner
                language="python"
                code="print('hi')"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{ enabled: true }}
                isAuthenticated
                exerciseStateKey="exercise-a"
                showHeaderBar={false}
            />,
        );

        const second = renderToStaticMarkup(
            <CodeRunner
                language="python"
                code="print('hi')"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{ enabled: true }}
                isAuthenticated
                exerciseStateKey="exercise-b"
                showHeaderBar={false}
            />,
        );

        expect(first).toContain('data-testid="mock-xterm-terminal"');
        expect(first).not.toContain('data-testid="mock-output-surface"');
        expect(second).toContain('data-testid="mock-xterm-terminal"');
        expect(second).not.toContain('data-testid="mock-output-surface"');
    });

    it("passes the same topic workspace lease key across different bound exercises", () => {
        renderToStaticMarkup(
            <CodeRunner
                language="bash"
                code="echo hi"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{
                    enabled: true,
                    workspaceKey: "linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is",
                }}
                isAuthenticated
                exerciseStateKey="linux-terminal-fundamentals:linux-1-terminal-navigation:linux-1-orientation:what-the-terminal-is:try-it-card:ci-create-linux-start"
                showHeaderBar={false}
            />,
        );

        renderToStaticMarkup(
            <CodeRunner
                language="bash"
                code="echo hi"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{
                    enabled: true,
                    workspaceKey: "linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is",
                }}
                isAuthenticated
                exerciseStateKey="linux-terminal-fundamentals:linux-1-terminal-navigation:linux-1-orientation:what-the-terminal-is:try-it-card-2:ci-make-command-practice"
                showHeaderBar={false}
            />,
        );

        expect(mockedWorkspaceTerminalControllerCalls).toHaveLength(2);
        expect(mockedWorkspaceTerminalControllerCalls[0]?.workspaceKey).toBe(
            "linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is",
        );
        expect(mockedWorkspaceTerminalControllerCalls[1]?.workspaceKey).toBe(
            "linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is",
        );
    });

    it("passes a new workspace lease key when the topic changes", () => {
        renderToStaticMarkup(
            <CodeRunner
                language="bash"
                code="echo hi"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{
                    enabled: true,
                    workspaceKey: "linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is",
                }}
                isAuthenticated
                exerciseStateKey="linux-terminal-fundamentals:linux-1-terminal-navigation:linux-1-orientation:what-the-terminal-is:try-it-card:ci-create-linux-start"
                showHeaderBar={false}
            />,
        );

        renderToStaticMarkup(
            <CodeRunner
                language="bash"
                code="echo hi"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{
                    enabled: true,
                    workspaceKey: "linux-terminal-fundamentals:linux-1-terminal-navigation:where-am-i",
                }}
                isAuthenticated
                exerciseStateKey="linux-terminal-fundamentals:linux-1-terminal-navigation:linux-1-orientation:where-am-i:try-it-card:ci-pwd-practice"
                showHeaderBar={false}
            />,
        );

        expect(mockedWorkspaceTerminalControllerCalls).toHaveLength(2);
        expect(mockedWorkspaceTerminalControllerCalls[0]?.workspaceKey).not.toBe(
            mockedWorkspaceTerminalControllerCalls[1]?.workspaceKey,
        );
    });

    it("shows a restart terminal action for workspace terminal mode", () => {
        const html = renderToStaticMarkup(
            <CodeRunner
                language="bash"
                code="echo hi"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor={false}
                showTerminal
                workspaceTerminal={{ enabled: true, workspaceKey: "linux:module:topic" }}
                isAuthenticated
                showHeaderBar
            />,
        );

        expect(html).toContain('aria-label="Restart terminal"');
    });

    it("restarts the workspace terminal by stopping and reopening the same session scope", async () => {
        const steps: string[] = [];
        const stop = vi.fn(async () => {
            steps.push("stop");
        });
        const open = vi.fn(async () => {
            steps.push("open");
        });
        const resetAutoOpen = vi.fn(() => {
            steps.push("reset");
        });

        await restartWorkspaceTerminalSession({
            resetAutoOpen,
            workspaceTerm: { stop, open },
        });

        expect(steps).toEqual(["reset", "stop", "open"]);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it("keeps normal editor mode rendering the editor", () => {
        const html = renderToStaticMarkup(
            <CodeRunner
                language="python"
                code="print('hi')"
                onChangeCode={vi.fn()}
                onChangeLanguage={vi.fn()}
                showEditor
                showTerminal={false}
                editorTestId="editor-pane"
                showHeaderBar={false}
            />,
        );

        expect(html).toContain('data-testid="editor-pane"');
        expect(html).toContain('data-testid="mock-editor-pane"');
        expect(html).not.toContain('data-testid="mock-xterm-terminal"');
    });
});
