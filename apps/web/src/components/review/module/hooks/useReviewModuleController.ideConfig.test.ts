import { describe, expect, it } from "vitest";
import { resolveRightRailIdeConfig } from "./rightRailIdeConfig";

describe("resolveRightRailIdeConfig", () => {
    it("prefers the current route exercise ideConfig over stale tool state", () => {
        const resolved = resolveRightRailIdeConfig({
            toolIdeConfig: {
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace",
            },
            rightRailExerciseIdeConfig: {
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace/park-terminal-map/requests",
            },
            boundExerciseIdeConfig: {
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace/park-terminal-map",
            },
            runtimeEffectiveIdeConfig: null,
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map/requests");
    });

    it("prefers current route runtime config over stale sticky tool state", () => {
        const resolved = resolveRightRailIdeConfig({
            toolIdeConfig: {
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace",
            },
            rightRailExerciseIdeConfig: null,
            boundExerciseIdeConfig: null,
            runtimeEffectiveIdeConfig: {
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace/park-terminal-map",
            },
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map");
    });

    it("falls back to sticky tool state only when no current route or exercise config exists", () => {
        const resolved = resolveRightRailIdeConfig({
            toolIdeConfig: {
                terminalSessionScope: "exercise",
                terminalCwd: "/workspace/park-terminal-map",
            },
            rightRailExerciseIdeConfig: null,
            boundExerciseIdeConfig: null,
            runtimeEffectiveIdeConfig: null,
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map");
    });
});
