import { describe, expect, it } from "vitest";

import { normalizeExpectedForSave } from "./normalizeExpectedForSave";

describe("normalizeExpectedForSave source-mode code_input", () => {
    const sourceCheck = {
        type: "source_regex",
        pattern: "<a\\b[^>]*href",
        path: "index.html",
        message: "Add the required link.",
        normalizeWhitespace: false,
    };

    it("accepts source-mode web validation without stdout tests", () => {
        const solutionFiles = [
            {
                path: "index.html",
                content: '<a href="about.html">About me</a>',
                language: "web",
                isEntry: true,
                entry: true,
            },
            {
                path: "about.html",
                content: "<h1>About</h1>",
                language: "web",
                isEntry: false,
                entry: false,
            },
        ];

        const normalized = normalizeExpectedForSave("code_input" as any, {
            kind: "code_input",
            strategy: "programming",
            language: "web",
            checkMode: "source",
            sourceChecks: [sourceCheck],
            workspaceExpectations: {
                requiredFiles: ["index.html", "about.html"],
            },
            solutionCode: '<a href="about.html">About me</a>',
            solutionFiles,
        } as any) as any;

        expect(normalized.kind).toBe("code_input");
        expect(normalized.strategy).toBe("programming");
        expect(normalized.language).toBe("web");
        expect(normalized.checkMode).toBe("source");
        expect(normalized.sourceChecks).toEqual([sourceCheck]);
        expect(normalized.workspaceExpectations).toEqual({
            requiredFiles: ["index.html", "about.html"],
        });
        expect(normalized.solutionFiles).toEqual(solutionFiles);
        expect(normalized.tests).toBeUndefined();
    });

    it("fails closed when source mode has no source checks", () => {
        expect(() =>
            normalizeExpectedForSave("code_input" as any, {
                kind: "code_input",
                strategy: "programming",
                language: "web",
                checkMode: "source",
                sourceChecks: [],
            } as any),
        ).toThrow(/source mode.*missing sourceChecks/i);
    });
});
