import { describe, expect, it } from "vitest";

import {
    buildWorkspaceTerminalStartupInput,
    mergeWorkspaceSnapshotBaseline,
    resolveWorkspacePreparationEntries,
    resolveWorkspaceTerminalStartupCwd,
    shouldPrimeWorkspacePrompt,
} from "./useWorkspaceTerminalController";

describe("shouldPrimeWorkspacePrompt", () => {
    it("returns true when the workspace terminal is interactive but still visually blank", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(true);
    });

    it("returns false once the terminal has already rendered visible output", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: true,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);
    });

    it("returns false while startup input is still queued", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: "cd -- /workspace/project\n",
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);
    });

    it("returns false when the session is not in a safe state to poke", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: null,
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: false,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: true,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: true,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: true,
            }),
        ).toBe(false);
    });
});


describe("resolveWorkspacePreparationEntries", () => {
    it("pushes hidden bootstrap files but verifies only snapshot-visible files", () => {
        const result = resolveWorkspacePreparationEntries([
            {
                kind: "file",
                path: ".zoeskoul/setup.sh",
                content: "git init -b main\n",
            },
            {
                kind: "file",
                path: "trail-journal/README.md",
                content: "# Trail Journal\n",
            },
            {
                kind: "file",
                path: ".bash_history",
                content: "git status\n",
            },
        ]);

        expect(result.replacementEntries.map((entry) => entry.path)).toEqual([
            ".zoeskoul/setup.sh",
            "trail-journal/README.md",
        ]);
        expect(
            result.snapshotExpectedEntries.map((entry) => entry.path),
        ).toEqual(["trail-journal/README.md"]);
    });

    it("does not wait for a snapshot when a workspace contains only internal bootstrap files", () => {
        const result = resolveWorkspacePreparationEntries([
            {
                kind: "file",
                path: ".zoeskoul/setup.sh",
                content: "git init -b main\n",
            },
        ]);

        expect(result.replacementEntries).toHaveLength(1);
        expect(result.snapshotExpectedEntries).toEqual([]);
    });
});

describe("mergeWorkspaceSnapshotBaseline", () => {
    it("keeps snapshot-opaque bootstrap files in the local sync baseline", () => {
        const result = mergeWorkspaceSnapshotBaseline(
            [
                {
                    kind: "file",
                    path: "trail-journal/README.md",
                    content: "# Trail Journal\n",
                },
            ],
            [
                {
                    kind: "file",
                    path: ".zoeskoul/setup.sh",
                    content: "git init -b main\n",
                },
                {
                    kind: "file",
                    path: "trail-journal/README.md",
                    content: "# Trail Journal\n",
                },
            ],
            new Set(),
        );

        expect(result).toEqual([
            {
                kind: "file",
                path: ".zoeskoul/setup.sh",
                content: "git init -b main\n",
            },
            {
                kind: "file",
                path: "trail-journal/README.md",
                content: "# Trail Journal\n",
            },
        ]);
    });

    it("still applies dirty learner-file overrides without treating internal omission as deletion", () => {
        const result = mergeWorkspaceSnapshotBaseline(
            [
                {
                    kind: "file",
                    path: "trail-journal/README.md",
                    content: "runner copy\n",
                },
            ],
            [
                {
                    kind: "file",
                    path: ".zoeskoul/setup.sh",
                    content: "git init -b main\n",
                },
                {
                    kind: "file",
                    path: "trail-journal/README.md",
                    content: "learner edit\n",
                },
            ],
            new Set(["trail-journal/README.md"]),
        );

        expect(result).toEqual([
            {
                kind: "file",
                path: ".zoeskoul/setup.sh",
                content: "git init -b main\n",
            },
            {
                kind: "file",
                path: "trail-journal/README.md",
                content: "learner edit\n",
            },
        ]);
    });
});


describe("resolveWorkspaceTerminalStartupCwd", () => {
    it("queues hidden bootstrap even when the terminal starts at workspace root", () => {
        expect(
            resolveWorkspaceTerminalStartupCwd({
                cwd: "/workspace",
                bootstrap: { gitSafeDirectories: ["/workspace/*"] },
            }),
        ).toBe("/workspace");
    });

    it("queues deterministic workspace setup at the workspace root", () => {
        expect(
            resolveWorkspaceTerminalStartupCwd({
                cwd: "/workspace",
                bootstrap: { setupScriptPath: ".zoeskoul/setup.sh" },
            }),
        ).toBe("/workspace");
    });

    it("does not add startup work for an ordinary workspace-root terminal", () => {
        expect(
            resolveWorkspaceTerminalStartupCwd({ cwd: "/workspace" }),
        ).toBeNull();
        expect(resolveWorkspaceTerminalStartupCwd({})).toBeNull();
    });

    it("preserves authored subdirectory startup without Git bootstrap", () => {
        expect(
            resolveWorkspaceTerminalStartupCwd({
                cwd: "/workspace/python-project",
            }),
        ).toBe("/workspace/python-project");
    });
});


describe("buildWorkspaceTerminalStartupInput", () => {
    it("runs Git trust setup silently before entering the authored repository", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace/trail-journal",
            bootstrap: {
                gitSafeDirectories: ["/workspace/*", "/workspace/*"],
                setupScriptPath: ".zoeskoul/setup.sh",
                workspaceStateKey: "git-state-v1-test",
            },
            markerParts: ["marker-a", "marker-b", "marker-c"],
        });

        expect(input.startsWith(" ")).toBe(true);
        expect(input).not.toContain("__zoe_prepare_workspace() {");
        expect(input).toContain(
            "__zoe_setup='/workspace/.zoeskoul/setup.sh'",
        );
        expect(input).toContain("__zoe_setup_status=0");
        expect(input).toContain(
            "__zoe_setup_signature='git-state-v1-test'",
        );
        expect(input).toContain(
            '(cd -- /workspace && /bin/bash "$__zoe_setup")',
        );
        expect(input).toContain(
            "printf '%s%s%s%s\\n' '__ZOESKOUL_STARTUP_CWD_FAILED___' 'marker-a' 'marker-b' 'marker-c'",
        );
        expect(input).toContain("export GIT_CONFIG_COUNT=1");
        expect(input).toContain("export GIT_CONFIG_KEY_0='safe.directory'");
        expect(input).toContain(
            "export GIT_CONFIG_VALUE_0='/workspace/trail-journal'",
        );
        expect(input).not.toContain("git config --global");
        expect(input).not.toContain("/workspace/*");
        expect(input.indexOf("export GIT_CONFIG_COUNT=1")).toBeLessThan(
            input.indexOf('/bin/bash "$__zoe_setup"'),
        );
        expect(input.indexOf('/bin/bash "$__zoe_setup"')).toBeLessThan(
            input.lastIndexOf("cd -- '/workspace/trail-journal'"),
        );
        expect(input).toContain("export PS1='[zoeskoul]\\w\\$ '");
        expect(input).toContain(
            "printf '%s%s%s\\n' 'marker-a' 'marker-b' 'marker-c'",
        );
        expect(input).not.toContain("marker-amarker-bmarker-c");
        expect(input).not.toContain(
            "__ZOESKOUL_STARTUP_CWD_FAILED___marker-amarker-bmarker-c",
        );
        expect(input.trimEnd().split("\n")).toHaveLength(1);
        expect(input.endsWith("\n")).toBe(true);
    });

    it("drops unsafe Git trust paths instead of executing them", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace/trail-journal",
            bootstrap: {
                gitSafeDirectories: [
                    "/tmp/other-project",
                    "/workspace/trail-journal/../other",
                    "/workspace/project/*/nested",
                    "/workspace/project?[bad]",
                    "/workspace/project\nmalicious",
                ],
            },
            markerParts: ["a", "b", "c"],
        });

        expect(input).not.toContain("GIT_CONFIG_KEY_");
        expect(input).toContain("cd -- '/workspace/trail-journal'");
    });

    it("drops unsafe setup script paths instead of executing them", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace/trail-journal",
            bootstrap: {
                setupScriptPath: "../outside.sh",
                workspaceStateKey: "unsafe",
            },
            markerParts: ["a", "b", "c"],
        });

        expect(input).not.toContain("outside.sh");
        expect(input).not.toContain("__zoe_prepare_workspace");
        expect(input).toContain("cd -- '/workspace/trail-journal'");
    });

    it("keeps non-Git workspace startup unchanged", () => {
        const input = buildWorkspaceTerminalStartupInput({
            cwd: "/workspace/python-project",
            markerParts: ["a", "b", "c"],
        });

        expect(input).not.toContain("GIT_CONFIG_COUNT");
        expect(input).toBe(
            "cd -- '/workspace/python-project' && export PS1='[zoeskoul]\\w\\$ ' && printf '%s%s%s\\n' 'a' 'b' 'c'\n",
        );
    });
});
