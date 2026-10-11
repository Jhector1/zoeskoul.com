import { describe, expect, it } from "vitest";

import {
    projectStepNeedsFileWorkspace,
    withGrowingWorkspaceIdeConfig,
} from "./growingWorkspaceIdeConfig";

describe("growing workspace IDE capability inference", () => {
    it("keeps a genuine one-file exercise in single-file presentation", () => {
        const step = {
            starterFiles: [{ path: "index.html", content: "<h1>Start</h1>" }],
            solutionFiles: [{ path: "index.html", content: "<h1>Done</h1>" }],
        };

        expect(projectStepNeedsFileWorkspace(step)).toBe(false);
        expect(withGrowingWorkspaceIdeConfig(step)).toBe(step);
    });

    it("enables file + multi-file capability when the solution adds a file", () => {
        const step = {
            starterFiles: [{ path: "index.html", content: "<h1>Home</h1>" }],
            solutionFiles: [
                { path: "index.html", content: "<h1>Home</h1>" },
                { path: "about.html", content: "<h1>About</h1>" },
            ],
        };

        const resolved = withGrowingWorkspaceIdeConfig(step) as any;

        expect(projectStepNeedsFileWorkspace(step)).toBe(true);
        expect(resolved.ideConfig).toEqual({
            requires: {
                files: true,
                multiFile: true,
            },
        });

        expect(JSON.stringify(resolved.ideConfig)).not.toContain("about.html");
        expect(JSON.stringify(resolved.ideConfig)).not.toContain("<h1>About</h1>");
    });

    it("keeps Explorer capability on later steps whose starter is already multi-file", () => {
        const step = {
            workspace: {
                starterFiles: [
                    { path: "index.html", content: "" },
                    { path: "about.html", content: "" },
                ],
            },
            solutionFiles: [
                { path: "index.html", content: "" },
                { path: "about.html", content: "" },
            ],
        };

        const resolved = withGrowingWorkspaceIdeConfig(step) as any;

        expect(projectStepNeedsFileWorkspace(step)).toBe(true);
        expect(resolved.ideConfig.requires.files).toBe(true);
        expect(resolved.ideConfig.requires.multiFile).toBe(true);
    });

    it("preserves existing IDE requirements while adding file capability", () => {
        const step = {
            ideConfig: {
                requires: {
                    terminal: true,
                },
                runnerBackend: "pty",
            },
            starterFiles: [{ path: "main.py", content: "" }],
            solutionFiles: [
                { path: "main.py", content: "" },
                { path: "helper.py", content: "" },
            ],
        };

        const resolved = withGrowingWorkspaceIdeConfig(step) as any;

        expect(resolved.ideConfig.runnerBackend).toBe("pty");
        expect(resolved.ideConfig.requires).toEqual({
            terminal: true,
            files: true,
            multiFile: true,
        });
    });
});
