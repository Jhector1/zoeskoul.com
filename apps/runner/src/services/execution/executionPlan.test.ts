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


    it("leaves hidden lesson setup to the post-sync terminal bootstrap", () => {
        const plan = getExecutionPlan("bash", undefined, [], {
            shell: true,
            cwd: "/workspace/project",
        });

        const command = plan.runCmd.at(-1) ?? "";
        expect(command).not.toContain(".zoeskoul/setup.sh");
        expect(command).not.toContain(".setup-complete");
        expect(command).toContain('cd "${START_CWD:-/workspace}"');
        expect(command).toContain("exec /bin/bash --noprofile --norc -i");
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


describe("R execution plan", () => {
    it("runs an authored R entry with Rscript --vanilla", () => {
        const plan = getExecutionPlan("r", "main.R", [
            { kind: "file", path: "main.R", content: 'cat(mean(c(2, 4, 6)), "\\n")\n' },
        ]);

        expect(plan.compileCmd).toBeUndefined();
        expect(plan.runCmd).toEqual(["Rscript", "--vanilla", "main.R"]);
    });

    it("supports nested R entry paths and rejects a missing entry", () => {
        const plan = getExecutionPlan("r", "src/main.R", [
            { kind: "file", path: "src/main.R", content: 'source("../helpers.R")\n' },
            { kind: "file", path: "helpers.R", content: "double_value <- function(x) x * 2\n" },
        ]);

        expect(plan.runCmd).toEqual(["Rscript", "--vanilla", "src/main.R"]);
        expect(() => getExecutionPlan("r")).toThrow(/Missing R entry file/);
    });
});
