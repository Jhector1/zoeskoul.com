import { describe, expect, it } from "vitest";
import { getExecutionPlan } from "./executionPlan.js";

describe("getExecutionPlan", () => {
    it("prepares the authored shell cwd under /workspace", () => {
        const plan = getExecutionPlan("bash", undefined, [], {
            shell: true,
            cwd: "/workspace/park-terminal-map/requests",
        });

        expect(plan.prepareDirs).toEqual(["park-terminal-map/requests"]);
    });

    it("does not prepare dirs for the workspace root", () => {
        const plan = getExecutionPlan("bash", undefined, [], {
            shell: true,
            cwd: "/workspace",
        });

        expect(plan.prepareDirs).toBeUndefined();
    });

    it("rejects cwd values outside /workspace", () => {
        expect(() =>
            getExecutionPlan("bash", undefined, [], {
                shell: true,
                cwd: "/tmp/nope",
            }),
        ).toThrow(/Unsafe cwd/);
    });
});
