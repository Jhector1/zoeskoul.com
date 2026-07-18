import { describe, expect, it } from "vitest";
import { repairGitDraft } from "./repairGitDraft.js";

describe("repairGitDraft learner experience", () => {
    it("keeps setup internal while preserving the Git task", async () => {
        const result = await repairGitDraft({
            seed: {
                topicId: "status-practice",
                title: "Read repository state",
                plannedExerciseCounts: {
                    counts: {
                        single_choice: 0,
                        multi_choice: 0,
                        drag_reorder: 0,
                        fill_blank_choice: 0,
                        code_input: 1,
                    },
                },
            } as any,
            draft: {
                title: "Read repository state",
                summary: "Use Git status to read a repository.",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "sketch0",
                        cardTitle: "Read the state",
                        title: "Ask Git before acting",
                        bodyMarkdown: "Git status describes the current repository state.",
                    },
                ],
                quizDraft: [
                    {
                        id: "try-status-practice-sketch0",
                        kind: "code_input",
                        title: "Check the repository",
                        prompt: "Run `git status`.\n\nFirst type `bash .zoeskoul/setup.sh` and press Enter.",
                        hint: "The setup command prepares the repository.",
                        help: {
                            concept: "Read repository state before changing it.",
                            hint_1: "Use the status command.",
                            hint_2: "Look for the current branch and file state.",
                        },
                        starterCode: "# First type: bash .zoeskoul/setup.sh\n",
                        solutionCode: "bash .zoeskoul/setup.sh\ncd trail-journal\ngit status\n",
                        fixedLanguage: "bash",
                        recipeType: "shell_task",
                        mode: "terminal_workspace",
                        entryFilePath: "main.sh",
                        instructions: "Run `git status`.\n\nFirst type `bash .zoeskoul/setup.sh` and press Enter.",
                        starterFiles: [
                            {
                                path: "main.sh",
                                content: "# First type: bash .zoeskoul/setup.sh\n",
                                language: "bash",
                                isEntry: true,
                                entry: true,
                            },
                            {
                                path: ".zoeskoul/setup.sh",
                                content: "#!/usr/bin/env bash\ngit init -q -b main\n",
                                language: "bash",
                                readOnly: true,
                            },
                        ],
                        solutionFiles: [
                            {
                                path: "main.sh",
                                content: "bash .zoeskoul/setup.sh\ncd trail-journal\ngit status\n",
                                language: "bash",
                                isEntry: true,
                                entry: true,
                            },
                            {
                                path: ".zoeskoul/setup.sh",
                                content: "#!/usr/bin/env bash\ngit init -q -b main\n",
                                language: "bash",
                                readOnly: true,
                            },
                        ],
                        gitExpectations: {
                            repositoryPath: "trail-journal",
                            repositoryInitialized: true,
                        },
                        terminalExpectations: {
                            requiredCommands: [
                                { pattern: "^bash\\s+\\.zoeskoul/setup\\.sh$" },
                                { pattern: "^git\\s+status$" },
                            ],
                        },
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.prompt).toBe(
            "Run `git status`.\n\nType each command in the terminal and press Enter.",
        );
        expect(exercise.starterCode).not.toContain("setup.sh");
        expect(exercise.solutionCode).toBe("git status\n");
        expect(exercise.solutionFiles[0].content).toBe("git status\n");
        expect(exercise.solutionFiles[1].path).toBe(".zoeskoul/setup.sh");
        expect(exercise.terminalExpectations.requiredCommands).toEqual([
            { pattern: "^git\\s+status$" },
        ]);
    });
});
