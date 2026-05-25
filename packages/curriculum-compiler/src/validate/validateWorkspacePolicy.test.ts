import { describe, expect, it } from "vitest";
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import { repairPythonDraft } from "../../../curriculum-profiles/src/python/repair/repairPythonDraft.js";
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

    it("resolves a file-enabled Python module policy without enabling terminal or package install", () => {
        const policy = resolveWorkspacePolicy({
            blueprint: makeBlueprint({
                subjectSlug: "python--python-data-functions--draft",
                courseSlug: "python-data-functions",
                catalogSlug: "python",
                profileId: "python",
                workspaceProfileId: "browser-code-runner",
                modulePolicies: [
                    {
                        moduleNumber: 6,
                        workspaceProfileId: "browser-python-files-runner",
                    },
                ],
            }),
            moduleNumber: 6,
        });

        expect(policy.workspace.id).toBe("browser-python-files-runner");
        expect(policy.workspace.ui.filesPanelLabel).toBe("files panel");
        expect(policy.workspace.capabilities.filesystem.enabled).toBe(true);
        expect(policy.workspace.capabilities.multiFileProjects.enabled).toBe(true);
        expect(policy.workspace.capabilities.terminal.enabled).toBe(false);
        expect(policy.workspace.capabilities.packageInstall.enabled).toBe(false);
    });

    it("passes Python workspace validation after deterministic repair removes Terminal", async () => {
        const repaired = await repairPythonDraft({
            seed: {
                topicId: "running-python-code",
                profileId: "python",
                workspacePolicy: {
                    workspace: {
                        capabilities: {
                            terminal: { enabled: false },
                        },
                    },
                },
            } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "multi_choice",
                        title: "Workspace parts",
                        prompt: "Which of these are visible in the Terminal?",
                        hint: "Read the console carefully.",
                        help: {
                            concept: "The terminal shows output.",
                            hint_1: "The console is visible below the editor.",
                            hint_2: "The shell is not needed here.",
                        },
                        options: ["Code editor", "Output panel", "Terminal", "File manager"],
                        correctOptionIds: ["a", "b"],
                    },
                ],
            } as any,
        });

        const policy = resolveWorkspacePolicy({
            blueprint: makeBlueprint({
                subjectSlug: "python-v2",
                courseSlug: "python-for-beginners",
                catalogSlug: "python",
                profileId: "python",
                workspaceProfileId: "browser-code-runner",
                workspacePolicyId: "python-browser-workspace",
                courseGenerationPolicy: {
                    avoidTerms: ["terminal", "command line", "shell", "console", ".py", "pip install"],
                    preferredTerms: {
                        terminal: "code editor",
                        "command line": "code editor",
                        shell: "code editor",
                        console: "output panel",
                    },
                },
            }),
        });

        expect(() =>
            validateWorkspacePolicy({
                text: JSON.stringify(repaired.draft),
                policy,
                location: "python/repaired",
            }),
        ).not.toThrow();
    });

    it("allows terminal wording for a future profile policy that explicitly supports terminals", () => {
        expect(() =>
            validateWorkspacePolicy({
                text: "Open the terminal and run the command there.",
                policy: {
                    workspacePolicyId: "terminal-workspace",
                    preferredTerms: {},
                    forbiddenActionLanguage: [],
                    avoidTerms: [],
                } as any,
                location: "future/test",
            }),
        ).not.toThrow();
    });
});
