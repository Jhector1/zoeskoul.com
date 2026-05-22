import { describe, expect, it } from "vitest";
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import { resolveWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { validateWorkspacePolicy } from "./validateWorkspacePolicy.js";

function makeBlueprint(overrides: Partial<CourseBlueprint>): CourseBlueprint {
    return {
        subjectSlug: "sql-v2",
        courseSlug: "sql-foundations",
        catalogSlug: "sql",
        profileId: "sql",
        sourceLocale: "en",
        targetLocales: [],
        title: "Fixture",
        description: "Fixture",
        level: "beginner",
        audience: [],
        goals: [],
        constraints: {
            moduleCount: 1,
            topicsPerModuleMin: 1,
            topicsPerModuleMax: 1,
        },
        ...overrides,
    };
}

describe("validateWorkspacePolicy", () => {
    it("fails when SQL learner-facing text says open sqlite3 in the terminal", () => {
        const policy = resolveWorkspacePolicy({
            blueprint: makeBlueprint({
                workspaceProfileId: "browser-sql-runner",
                workspacePolicyId: "sql-browser-workspace",
                courseGenerationPolicy: {
                    avoidTerms: ["terminal", "sqlite3", ".sql"],
                    preferredTerms: {
                        terminal: "SQL editor",
                    },
                },
            }),
        });

        expect(() =>
            validateWorkspacePolicy({
                text: "Open sqlite3 in the terminal and run the query there.",
                policy,
                location: "sql/test",
            }),
        ).toThrow(/Prefer "SQL editor" instead/);
    });

    it("passes when SQL learner-facing text uses SQL editor and Run query", () => {
        const policy = resolveWorkspacePolicy({
            blueprint: makeBlueprint({
                workspaceProfileId: "browser-sql-runner",
                courseGenerationPolicy: {
                    avoidTerms: ["terminal", "sqlite3", ".sql"],
                },
            }),
        });

        expect(() =>
            validateWorkspacePolicy({
                text: "Write the query in the SQL editor and click Run query, then check the results table.",
                policy,
                location: "sql/test",
            }),
        ).not.toThrow();
    });

    it("fails when Python learner-facing text says save this as main.py and run it in the terminal", () => {
        const policy = resolveWorkspacePolicy({
            blueprint: makeBlueprint({
                subjectSlug: "python-v2",
                courseSlug: "python-for-beginners",
                catalogSlug: "python",
                profileId: "python",
                workspaceProfileId: "browser-code-runner",
                workspacePolicyId: "python-browser-workspace",
                courseGenerationPolicy: {
                    avoidTerms: ["terminal", ".py", "pip install", "VS Code"],
                    preferredTerms: {
                        terminal: "code editor",
                    },
                },
            }),
        });

        expect(() =>
            validateWorkspacePolicy({
                text: "Save this as main.py and run it in the terminal.",
                policy,
                location: "python/test",
            }),
        ).toThrow(/forbidden learner-facing term/);
    });

    it("passes when Python learner-facing text uses code editor and Run", () => {
        const policy = resolveWorkspacePolicy({
            blueprint: makeBlueprint({
                subjectSlug: "python-v2",
                courseSlug: "python-for-beginners",
                catalogSlug: "python",
                profileId: "python",
                workspaceProfileId: "browser-code-runner",
                courseGenerationPolicy: {
                    avoidTerms: ["terminal", ".py", "pip install", "VS Code"],
                },
            }),
        });

        expect(() =>
            validateWorkspacePolicy({
                text: "Write code in the code editor and click Run, then read the output panel.",
                policy,
                location: "python/test",
            }),
        ).not.toThrow();
    });
});
