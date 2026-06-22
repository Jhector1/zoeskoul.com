import { describe, expect, it } from "vitest";
import { bashProfile } from "./profile.js";

describe("bashProfile", () => {
    it("tells the generator to put required shell tasks in quizDraft", () => {
        const rules = bashProfile.renderAuthoringPromptRules?.({
            seed: {
                plannedExerciseCounts: {
                    counts: {
                        code_input: 3,
                        fill_blank_choice: 2,
                    },
                },
            } as any,
            shape: {} as any,
        }) ?? [];

        const joined = rules.join("\n");

        expect(joined).toContain("exactly 3 Bash/Linux code_input");
        expect(joined).toMatch(/quizDraft/);
        expect(joined).toMatch(/shell_task/);
        expect(joined).toMatch(/terminal_workspace/);
        expect(joined).toMatch(/workspaceExpectations|requiredFolders|requiredFiles/);
        expect(joined).toMatch(/terminalExpectations|requiredCommands|outputRegex/);
        expect(joined).toMatch(/shell_task expected payload/);
        expect(joined).toMatch(/per-exercise terminal workspaces/);
        expect(joined).toMatch(/extra fill_blank_choice/);
    });

    it("preserves Linux shell_task workspace and terminal expectations in the manifest", () => {
        const exercise = bashProfile.codeInput?.buildManifest({
            messageBase: "quiz.linux.copy",
            seed: { topicId: "copy-files", profileId: "bash" } as any,
            exercise: {
                id: "copy-files-1",
                kind: "code_input",
                title: "Copy a file",
                prompt: "Copy notes/today.txt to backups/today.txt.",
                fixedLanguage: "bash",
                recipeType: "shell_task",
                mode: "terminal_workspace",
                entryFilePath: "main.sh",
                starterCode: "# Use the terminal for this task.\n",
                workspaceExpectations: {
                    requiredFiles: ["backups/today.txt"],
                    requiredFolders: ["backups"],
                },
                terminalExpectations: {
                    requiredCommands: [
                        { pattern: "^cp\\s+notes/today\\.txt\\s+backups/today\\.txt$" },
                    ],
                    outputRegex: ["today\\.txt"],
                    cwdEndsWith: "workspace",
                },
            } as any,
        });

        expect(exercise?.recipe).toEqual({
            type: "shell_task",
            mode: "terminal_workspace",
            instructions: "Copy notes/today.txt to backups/today.txt.",
        });
        expect(exercise?.workspaceExpectations).toEqual({
            requiredFiles: ["backups/today.txt"],
            requiredFolders: ["backups"],
        });
        expect(exercise?.workspace?.workspaceExpectations).toEqual({
            requiredFiles: ["backups/today.txt"],
            requiredFolders: ["backups"],
        });
        expect(exercise?.terminalExpectations).toEqual({
            requiredCommands: [
                { pattern: "^cp\\s+notes/today\\.txt\\s+backups/today\\.txt$" },
            ],
            outputRegex: ["today\\.txt"],
            cwdEndsWith: "workspace",
        });
    });

    it("reports invalid generated Linux terminal recipes", () => {
        const issues = bashProfile.validateTopicBundle({
            topicId: "linux-topic",
            subjectSlug: "linux-terminal-fundamentals",
            courseSlug: "linux-terminal-fundamentals",
            moduleSlug: "linux-module-1-terminal-navigation",
            sectionSlug: "linux-module-1-orientation",
            prefix: "linux_module_1",
            minutes: 15,
            topic: { labelKey: "topics.linux.label", summaryKey: "topics.linux.summary" },
            cards: [],
            sketches: [],
            exercises: [
                {
                    id: "bad-linux-code",
                    kind: "code_input",
                    purpose: "project",
                    weight: 1,
                    messageBase: "quiz.linux.bad",
                    language: "bash",
                    starterCode: "",
                    recipe: { type: "fixed_tests", tests: [{ stdout: "ok" }] },
                },
                {
                    id: "missing-expectations",
                    kind: "code_input",
                    purpose: "project",
                    weight: 1,
                    messageBase: "quiz.linux.missing",
                    language: "bash",
                    starterCode: "",
                    recipe: { type: "shell_task", mode: "terminal_workspace" },
                },
            ],
        } as any);

        expect(issues.join("\n")).toMatch(/recipe.type "shell_task"/);
        expect(issues.join("\n")).toMatch(/workspaceExpectations, terminalExpectations/);
    });

    it("rejects terminalExpectations outside terminal_workspace mode", () => {
        expect(() =>
            bashProfile.codeInput?.buildManifest({
                messageBase: "quiz.linux.pwd",
                seed: { topicId: "pwd", profileId: "bash" } as any,
                exercise: {
                    id: "pwd-1",
                    kind: "code_input",
                    title: "Run pwd",
                    prompt: "Run pwd.",
                    fixedLanguage: "bash",
                    recipeType: "shell_task",
                    mode: "stdout",
                    terminalExpectations: {
                        requiredCommands: [{ pattern: "^pwd$" }],
                    },
                } as any,
            }),
        ).toThrow(/terminalExpectations/);
    });

});
