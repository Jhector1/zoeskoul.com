import { describe, expect, it } from "vitest";
import {
    appendTerminalEvidenceCommand,
    appendTerminalEvidenceOutput,
    buildTerminalAutoOpenKey,
    createDisconnectedTerminalRecovery,
    createTerminalEvidence,
    isTerminalActuallyInteractive,
    reuseInFlightPromise,
    resolveTerminalWorkspaceKey,
    shouldProbeTerminalOnVisibilityRestore,
    workspaceTerminalBootstrapKey,
} from "@/components/code/runner/runtime";

describe("resolveTerminalWorkspaceKey", () => {
    const topicExerciseA =
        "linux-terminal-fundamentals:linux-1-terminal-navigation:linux-1-orientation:what-the-terminal-is:try-it-card:ci-create-linux-start";
    const topicExerciseB =
        "linux-terminal-fundamentals:linux-1-terminal-navigation:linux-1-orientation:what-the-terminal-is:try-it-card-2:ci-make-command-practice";

    it("reuses the same topic key across different exercise ids in the same topic", () => {
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseA,
                terminalSessionScope: "topic",
            }),
        ).toBe("linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is");
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseB,
                terminalSessionScope: "topic",
            }),
        ).toBe("linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is");
    });

    it("keeps different exercise keys distinct for exercise scope", () => {
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseA,
                terminalSessionScope: "exercise",
            }),
        ).toBe(topicExerciseA);
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseB,
                terminalSessionScope: "exercise",
            }),
        ).toBe(topicExerciseB);
    });

    it("prefers projectId for project scope", () => {
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseA,
                projectId: "project-42",
                terminalSessionScope: "project",
            }),
        ).toBe("project:project-42");
    });

    it("reuses an existing topic history scope when it is already scoped safely", () => {
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseA,
                terminalHistoryScopeKey:
                    "linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is",
                terminalSessionScope: "topic",
            }),
        ).toBe("linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is");
    });

    it("keys terminal leases by normalized startup bootstrap", () => {
        const bootstrapKey = workspaceTerminalBootstrapKey({
            gitSafeDirectories: [
                "/workspace/trail-journal",
                "/workspace/*",
                "/workspace/trail-journal",
            ],
            setupScriptPath: ".zoeskoul/setup.sh",
            workspaceStateKey: "git-state-v1-abc123",
        });

        expect(bootstrapKey).toBe(
            'workspace-bootstrap-v3:{"gitSafeDirectories":["/workspace/*","/workspace/trail-journal"],"setupScriptPath":".zoeskoul/setup.sh","workspaceStateKey":"git-state-v1-abc123"}',
        );
        expect(
            resolveTerminalWorkspaceKey({
                exerciseStateKey: topicExerciseA,
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace/trail-journal",
                terminalBootstrapKey: bootstrapKey,
            }),
        ).toBe(
            `${topicExerciseA}::cwd:/workspace/trail-journal::bootstrap:${bootstrapKey}`,
        );
    });


    it("changes the lease identity when the authored workspace state changes", () => {
        const first = workspaceTerminalBootstrapKey({
            setupScriptPath: ".zoeskoul/setup.sh",
            workspaceStateKey: "git-state-v1-first",
        });
        const second = workspaceTerminalBootstrapKey({
            setupScriptPath: ".zoeskoul/setup.sh",
            workspaceStateKey: "git-state-v1-second",
        });

        expect(first).not.toBe(second);
    });

    it("falls back safely when scoped keys are missing", () => {
        expect(
            resolveTerminalWorkspaceKey({
                terminalSessionScope: "topic",
                terminalHistoryScopeKey: "local::actor::review-tool:bound-exercise::bash",
                exerciseStateKey: "standalone-exercise",
            }),
        ).toBe("standalone-exercise");
        expect(
            resolveTerminalWorkspaceKey({
                terminalSessionScope: "topic",
                terminalHistoryScopeKey: "project:project-42",
                exerciseStateKey: topicExerciseA,
            }),
        ).toBe("linux-terminal-fundamentals:linux-1-terminal-navigation:what-the-terminal-is");
        expect(
            resolveTerminalWorkspaceKey({
                terminalSessionScope: "module",
                terminalHistoryScopeKey: "local::actor::review-tool:bound-exercise::bash",
            }),
        ).toBe("local::actor::review-tool:bound-exercise::bash");
    });
});

describe("buildTerminalAutoOpenKey", () => {
    it("uses the terminal lease key ahead of the bound exercise id", () => {
        expect(
            buildTerminalAutoOpenKey({
                workspaceKey: "linux:module:topic",
                exerciseStateKey: "linux:module:section:topic:card:exercise-a",
                projectId: "lesson-project",
                cwd: "/workspace",
            }),
        ).toBe("linux:module:topic::lesson-project::/workspace");
    });

    it("falls back to the exercise key when no explicit workspace lease key exists", () => {
        expect(
            buildTerminalAutoOpenKey({
                exerciseStateKey: "exercise-a",
                cwd: "/workspace",
            }),
        ).toBe("exercise-a::::/workspace");
    });
});

describe("terminal evidence helpers", () => {
    it("records typed commands", () => {
        const evidence = appendTerminalEvidenceCommand(
            createTerminalEvidence("/workspace"),
            "pwd",
            "/workspace",
        );

        expect(evidence).toEqual({
            commands: ["pwd"],
            outputText: "",
            cwd: "/workspace",
        });
    });

    it("appends output chunks to outputText", () => {
        const evidence = appendTerminalEvidenceOutput(
            createTerminalEvidence(),
            "/workspace\n",
        );

        expect(evidence.outputText).toBe("/workspace\n");
    });

    it("caps the evidence buffers", () => {
        let evidence = createTerminalEvidence();

        for (let i = 0; i < 60; i += 1) {
            evidence = appendTerminalEvidenceCommand(evidence, `cmd-${i}`);
        }

        evidence = appendTerminalEvidenceOutput(evidence, "x".repeat(25_000));

        expect(evidence.commands).toHaveLength(50);
        expect(evidence.commands[0]).toBe("cmd-10");
        expect(evidence.outputText).toHaveLength(20_000);
    });
});

describe("terminal connection helpers", () => {
    it("keeps terminal interactive while socket bookkeeping is briefly stale", () => {
        expect(
            isTerminalActuallyInteractive({
                inputEnabled: true,
                sessionId: "sess_123",
                socketReadyState: 3,
                connectionState: "disconnected",
                restarting: false,
                stopping: false,
                recoverState: "none",
            }),
        ).toBe(true);
    });

    it("does not report interactive during recovery", () => {
        expect(
            isTerminalActuallyInteractive({
                inputEnabled: true,
                sessionId: "sess_123",
                socketReadyState: 1,
                connectionState: "connected",
                restarting: false,
                stopping: false,
                recoverState: "restart_available",
            }),
        ).toBe(false);
    });

    it("builds the disconnected recovery prompt copy", () => {
        expect(createDisconnectedTerminalRecovery()).toEqual({
            state: "restart_available",
            message: "Terminal session is disconnected.",
        });
    });

    it("marks a hidden-tab terminal for probing when the socket is stale", () => {
        expect(
            shouldProbeTerminalOnVisibilityRestore({
                sessionId: "session-1",
                socketReadyState: 1,
                lastSocketMessageAt: 1_000,
                started: true,
                starting: false,
                now: 47_000,
            }),
        ).toBe(true);
    });

    it("marks a hidden-tab terminal as disconnected when the socket is no longer open", () => {
        expect(
            shouldProbeTerminalOnVisibilityRestore({
                sessionId: "session-1",
                socketReadyState: 3,
                lastSocketMessageAt: 46_000,
                started: true,
                starting: false,
                now: 47_000,
            }),
        ).toBe(true);
    });

    it("reuses the same in-flight restart promise for double clicks", async () => {
        const ref: { current: Promise<string> | null } = { current: null };
        let runs = 0;

        const factory = async () => {
            runs += 1;
            await Promise.resolve();
            return "ok";
        };

        const first = reuseInFlightPromise(ref, factory);
        const second = reuseInFlightPromise(ref, factory);

        expect(first).toBe(second);
        await expect(first).resolves.toBe("ok");
        expect(runs).toBe(1);
        expect(ref.current).toBeNull();
    });
});
