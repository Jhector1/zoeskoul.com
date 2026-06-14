import { describe, expect, it } from "vitest";
import {
    buildTerminalAutoOpenKey,
    resolveTerminalWorkspaceKey,
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
