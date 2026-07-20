import { describe, expect, it } from "vitest";
import { validateProgrammingTeachingSketches } from "../../shared/validateProgrammingTeachingSketches.js";
import { repairGitDraft } from "./repairGitDraft.js";

function tryFillBlank(index: number) {
    const prompts = [
        "Modify `project.txt`, then use `git status` to inspect the working tree.",
        "Stage `project.txt` with `git add project.txt` and verify the staged state with `git status`.",
        "Commit the staged update with `git commit -m \"Update project file\"`, then inspect it with `git log --oneline`.",
        "View the concise history with `git log --oneline`.",
    ];

    return {
        id: `try-working-tree-staging-and-history-sketch${index}`,
        kind: "fill_blank_choice" as const,
        title: `Repository area ${index + 1}`,
        prompt: prompts[index],
        hint: "Use the Git command named in the prompt.",
        help: {
            concept: "Git separates the working tree, staging area, and history.",
            hint_1: "Inspect the repository state before and after the command.",
            hint_2: "Use the exact file name from the task.",
        },
        template: "The required command is [blank1].",
        choices: ["git status", "git log --oneline"],
        correctValue: "git status",
    };
}

describe("repairGitDraft", () => {
    it("promotes generated try-* substitutes into self-contained Git code_input exercises", async () => {
        const result = await repairGitDraft({
            seed: {
                profileId: "git",
                topicId: "working-tree-staging-and-history",
                title: "Working Tree, Staging Area, and History",
                plannedExerciseCounts: {
                    total: 10,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 2,
                        multi_choice: 1,
                        drag_reorder: 1,
                        fill_blank_choice: 2,
                        code_input: 4,
                    },
                },
            } as any,
            draft: {
                title: "Working Tree, Staging Area, and History",
                summary: "Move one file through the three repository areas.",
                minutes: 20,
                sketchBlocks: Array.from({ length: 4 }, (_, index) => ({
                    id: `working-tree-staging-and-history-sketch${index}`,
                    cardTitle: `Card ${index + 1}`,
                    title: `Sketch ${index + 1}`,
                    bodyMarkdown: `Worked example: repository area ${index + 1}.`,
                })),
                quizDraft: [
                    ...Array.from({ length: 4 }, (_, index) => tryFillBlank(index)),
                    {
                        id: "single-1",
                        kind: "single_choice",
                        title: "Choose one",
                        prompt: "Which area contains current edits?",
                        hint: "Think about files on disk.",
                        help: {
                            concept: "The working tree contains current edits.",
                            hint_1: "It is the area you edit directly.",
                            hint_2: "Choose the working tree.",
                        },
                        options: ["Working tree", "Remote", "Tag"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "single-2",
                        kind: "single_choice",
                        title: "Choose one",
                        prompt: "Which area prepares the next commit?",
                        hint: "It sits between editing and history.",
                        help: {
                            concept: "The staging area prepares the next commit.",
                            hint_1: "It is also called the index.",
                            hint_2: "Choose the staging area.",
                        },
                        options: ["Remote", "Staging area", "Tag"],
                        correctOptionIds: ["b"],
                    },
                    {
                        id: "multi-1",
                        kind: "multi_choice",
                        title: "Select states",
                        prompt: "Which are local repository areas?",
                        hint: "Choose the areas taught in the lesson.",
                        help: {
                            concept: "Git tracks local work across three areas.",
                            hint_1: "Choose working tree and staging area.",
                            hint_2: "Do not choose a hosted issue tracker.",
                        },
                        options: ["Working tree", "Staging area", "Issue tracker"],
                        correctOptionIds: ["a", "b"],
                    },
                    {
                        id: "drag-1",
                        kind: "drag_reorder",
                        title: "Order the flow",
                        prompt: "Order the local workflow.",
                        hint: "Edit, stage, then commit.",
                        help: {
                            concept: "Changes move through a predictable flow.",
                            hint_1: "The working tree comes first.",
                            hint_2: "History comes last.",
                        },
                        tokens: ["Edit", "Stage", "Commit"],
                        correctOrder: ["Edit", "Stage", "Commit"],
                    },
                    {
                        id: "fill-1",
                        kind: "fill_blank_choice",
                        title: "Complete the term",
                        prompt: "Complete the sentence.",
                        hint: "Choose the area for current edits.",
                        help: {
                            concept: "Current edits live in the working tree.",
                            hint_1: "It is not yet staged.",
                            hint_2: "Choose working tree.",
                        },
                        template: "Current edits live in the [blank1].",
                        choices: ["working tree", "remote"],
                        correctValue: "working tree",
                    },
                    {
                        id: "fill-2",
                        kind: "fill_blank_choice",
                        title: "Complete the term",
                        prompt: "Complete the sentence.",
                        hint: "Choose the area before history.",
                        help: {
                            concept: "The staging area prepares a commit.",
                            hint_1: "It is also called the index.",
                            hint_2: "Choose staging area.",
                        },
                        template: "Prepared changes live in the [blank1].",
                        choices: ["staging area", "remote"],
                        correctValue: "staging area",
                    },
                ],
            } as any,
        });

        const codeInputs = result.draft.quizDraft.filter(
            (exercise) => exercise.kind === "code_input",
        ) as any[];
        expect(codeInputs).toHaveLength(4);
        expect(
            result.draft.quizDraft.filter(
                (exercise) => exercise.kind === "fill_blank_choice",
            ),
        ).toHaveLength(2);
        expect(codeInputs.map((exercise) => exercise.id)).toEqual([
            "try-working-tree-staging-and-history-sketch0",
            "try-working-tree-staging-and-history-sketch1",
            "try-working-tree-staging-and-history-sketch2",
            "try-working-tree-staging-and-history-sketch3",
        ]);

        for (const exercise of codeInputs) {
            expect(exercise).toMatchObject({
                fixedLanguage: "bash",
                recipeType: "shell_task",
                mode: "terminal_workspace",
                entryFilePath: "main.sh",
                gitExpectations: {
                    repositoryInitialized: true,
                    currentBranch: "main",
                },
            });
            expect(exercise.prompt).toContain("press Enter");
            expect(exercise.starterFiles).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: "main.sh", isEntry: true }),
                    expect.objectContaining({ path: ".zoeskoul/setup.sh", readOnly: true }),
                ]),
            );
            expect(
                exercise.terminalExpectations.requiredCommands.length,
            ).toBeGreaterThanOrEqual(1);
            expect(
                exercise.terminalExpectations.requiredCommands.some(
                    ({ pattern }: { pattern: string }) =>
                        pattern.includes("zoeskoul/setup") ||
                        pattern.includes("^cd\\s+"),
                ),
            ).toBe(false);
        }

        expect(codeInputs[1].hiddenShellCheck.script).toContain(
            "git diff --cached --name-only",
        );
        expect(codeInputs[2].gitExpectations).toMatchObject({
            exactCommitCount: 2,
            cleanWorkingTree: true,
            commitMessages: [{ position: 0, matches: "^Update project file$" }],
        });
        expect(result.report.repairs).toHaveLength(4);
        expect(result.report.repairs.every((repair) => repair.severity === "low")).toBe(true);
    });

    it("rebuilds malformed repository setup code inputs with nested Git workspaces", async () => {
        const rawExercises = [
            {
                id: "try-configure-and-initialize-a-repository-sketch0",
                title: "Initialize a New Repository",
                prompt: "Initialize a new Git repository in `project_alpha`.",
                solutionCode: "cd project_alpha\ngit init",
            },
            {
                id: "try-configure-and-initialize-a-repository-sketch1",
                title: "Explore the .git Directory",
                prompt: "After initializing `project_beta`, list `.git` and inspect `HEAD`.",
                solutionCode: "cd project_beta\nls .git",
            },
            {
                id: "try-configure-and-initialize-a-repository-sketch2",
                title: "Check Repository Status",
                prompt: "Check the status of `project_gamma`.",
                solutionCode: "cd project_gamma\ngit status",
            },
            {
                id: "try-configure-and-initialize-a-repository-sketch3",
                title: "Configure Local Git Identity",
                prompt: "Configure the local identity in `project_delta`.",
                solutionCode:
                    'cd project_delta\ngit config --local user.name "ZoeSkoul Learner"',
            },
        ].map((exercise) => ({
            ...exercise,
            kind: "code_input" as const,
            hint: "Use the requested command.",
            help: {
                concept: "Repository setup creates local Git metadata.",
                hint_1: "Work inside the named directory.",
                hint_2: "Check the final repository state.",
            },
            starterCode: "# Complete the task\n",
            recipeType: "sql_query" as const,
            starterFiles: [],
            solutionFiles: [],
        }));

        const result = await repairGitDraft({
            seed: {
                profileId: "git",
                topicId: "configure-and-initialize-a-repository",
                title: "Configure and Initialize a Repository",
                plannedExerciseCounts: {
                    total: 4,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 0,
                        multi_choice: 0,
                        drag_reorder: 0,
                        fill_blank_choice: 0,
                        code_input: 4,
                    },
                },
            } as any,
            draft: {
                title: "Configure and Initialize a Repository",
                summary: "Prepare deterministic local repositories.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: rawExercises,
            } as any,
        });

        const codeInputs = result.draft.quizDraft as any[];
        expect(codeInputs).toHaveLength(4);
        expect(
            codeInputs.every(
                (exercise) =>
                    exercise.recipeType === "shell_task" &&
                    exercise.mode === "terminal_workspace" &&
                    exercise.prompt.includes("press Enter") &&
                    exercise.terminalExpectations?.requiredCommands?.length > 0 &&
                    exercise.gitExpectations?.repositoryInitialized === true,
            ),
        ).toBe(true);

        expect(codeInputs[0].gitExpectations).toMatchObject({
            repositoryPath: "project_alpha",
            currentBranch: "main",
        });
        expect(codeInputs[1].solutionCode).toContain("cat .git/HEAD");
        expect(codeInputs[1].terminalExpectations.requiredCommands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ pattern: "^ls\\s+\\.git$" }),
                expect.objectContaining({ pattern: "^cat\\s+\\.git/HEAD$" }),
            ]),
        );
        expect(codeInputs[2].gitExpectations).toMatchObject({
            repositoryPath: "project_gamma",
            untrackedFiles: ["launch-notes.txt"],
        });
        expect(codeInputs[3].hiddenShellCheck.script).toContain(
            "git -C project_delta config --local user.email",
        );
        expect(
            codeInputs.every((exercise) =>
                exercise.starterFiles.some(
                    (file: any) =>
                        file.path === ".zoeskoul/setup.sh" && file.readOnly === true,
                ),
            ),
        ).toBe(true);
        expect(result.report.repairs).toHaveLength(4);
        expect(
            result.report.repairs.every(
                (repair) =>
                    repair.code === "GIT_CODE_INPUT_WORKSPACE_REBUILT" &&
                    repair.severity === "low",
            ),
        ).toBe(true);
    });

    it("rebuilds superficially valid setup exercises and removes semantic duplicate failures", async () => {
        const seed = {
            profileId: "git",
            topicId: "configure-and-initialize-a-repository",
            title: "Configure and Initialize a Repository",
            practice: {
                conceptualOnly: false,
                requiresTryIt: true,
                tryItPlacement: "all_sketches",
            },
            plannedExerciseCounts: {
                total: 4,
                dominantKind: "code_input",
                counts: {
                    single_choice: 0,
                    multi_choice: 0,
                    drag_reorder: 0,
                    fill_blank_choice: 0,
                    code_input: 4,
                },
            },
        } as any;
        const sketches = [
            {
                id: "configure-and-initialize-a-repository-sketch0",
                title: "Configuring User Identity in Git",
                bodyMarkdown: [
                    "A local identity attributes commits without changing global settings.",
                    "",
                    "```bash",
                    'git config --local user.name "ZoeSkoul Learner"',
                    'git config --local user.email "learner@zoeskoul.local"',
                    "```",
                    "",
                    "Both values are stored only in the current repository.",
                ].join("\n"),
            },
            {
                id: "configure-and-initialize-a-repository-sketch1",
                title: "Turning a Folder into a Git Repository",
                bodyMarkdown: "Worked example:\n\n```bash\ngit init\n```\n\nThe command creates .git metadata.",
            },
            {
                id: "configure-and-initialize-a-repository-sketch2",
                title: "Understanding the Git Status Command",
                bodyMarkdown: "Worked example:\n\n```bash\ngit status\n```\n\nThe result summarizes the local repository state.",
            },
            {
                id: "configure-and-initialize-a-repository-sketch3",
                title: "The Role of the .git Directory",
                bodyMarkdown: "Worked example:\n\n```bash\nls -a .git\n```\n\nThe listing reveals repository metadata.",
            },
        ];
        const solutionCodes = [
            'git config --local user.name "ZoeSkoul Learner"\ngit config --local user.email "learner@zoeskoul.local"',
            "git init",
            "git status",
            "ls -a .git",
        ];
        const draft = {
            title: seed.title,
            summary: "Prepare a repository and inspect its metadata.",
            minutes: 20,
            sketchBlocks: sketches,
            quizDraft: solutionCodes.map((solutionCode, index) => ({
                id: `try-configure-and-initialize-a-repository-sketch${index}`,
                kind: "code_input" as const,
                title: `Practice ${index + 1}`,
                prompt: "Complete the Git task.",
                hint: "Use the command from the task.",
                help: {
                    concept: "Repository setup creates local Git state.",
                    hint_1: "Work in the named repository.",
                    hint_2: "Inspect the final state.",
                },
                starterCode: "# Complete the task\n",
                solutionCode,
                fixedLanguage: "bash" as const,
                recipeType: "shell_task" as const,
                mode: "terminal_workspace" as const,
                terminalExpectations: {
                    requiredCommands: [{ pattern: "^git\\s+status$" }],
                },
            })),
        } as any;

        const result = await repairGitDraft({ seed, draft });
        const codeInputs = result.draft.quizDraft as any[];

        expect(codeInputs.map((exercise) => exercise.gitExpectations.repositoryPath)).toEqual([
            "project_alpha",
            "project_beta",
            "project_gamma",
            "project_delta",
        ]);
        expect(result.draft.sketchBlocks[0].bodyMarkdown).toContain(
            "Step by step",
        );
        expect(result.draft.sketchBlocks[0].bodyMarkdown).toContain(
            "The first line",
        );
        expect(result.draft.sketchBlocks[0].bodyMarkdown).toContain(
            "The second line",
        );

        const semanticIssues = validateProgrammingTeachingSketches({
            profileId: "git",
            seed,
            draft: result.draft,
        });
        expect(
            semanticIssues.filter((issue) =>
                [
                    "PROGRAMMING_LINE_BY_LINE_EXPLANATION_MISSING",
                    "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
                ].includes(issue.code),
            ),
        ).toEqual([]);
        expect(
            result.report.repairs.filter(
                (repair) => repair.code === "GIT_CODE_INPUT_WORKSPACE_REBUILT",
            ),
        ).toHaveLength(4);
        expect(
            result.report.repairs.some(
                (repair) =>
                    repair.code === "GIT_MULTILINE_EXAMPLE_EXPLANATION_ADDED",
            ),
        ).toBe(true);
    });

    it("rebuilds the six-step neighborhood guide capstone as one cumulative Git workflow", async () => {
        const stepIds = Array.from(
            { length: 6 },
            (_, index) =>
                `try-final-neighborhood-resource-guide-history-sketch${index}`,
        );
        const result = await repairGitDraft({
            seed: {
                profileId: "git",
                topicId: "final-neighborhood-resource-guide-history",
                title: "Final Capstone: Neighborhood Resource Guide History",
                sectionRole: "capstone",
                moduleRole: "capstone",
                practice: {
                    projectFlow: "progressive",
                },
                projectBrief: {
                    stepCountTarget: 6,
                },
                plannedExerciseCounts: {
                    total: 6,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 0,
                        multi_choice: 0,
                        drag_reorder: 0,
                        fill_blank_choice: 0,
                        code_input: 6,
                    },
                },
            } as any,
            draft: {
                title: "Final Capstone: Neighborhood Resource Guide History",
                summary: "Prepare a clean four-commit handoff.",
                minutes: 120,
                sketchBlocks: [
                    {
                        id: "intro",
                        title: "Project Brief",
                        bodyMarkdown: "A neighborhood help desk needs a maintained guide.",
                    },
                ],
                quizDraft: stepIds.map((id, index) => ({
                    id,
                    kind: "code_input" as const,
                    title: `Generated step ${index + 1}`,
                    prompt: "Complete the next capstone task.",
                    hint: "Use Git.",
                    help: {
                        concept: "Build the repository history.",
                        hint_1: "Inspect the repository state.",
                        hint_2: "Complete the requested milestone.",
                    },
                    starterCode: "# generated starter\n",
                    solutionCode: "# generated solution\n",
                    recipeType: "shell_task" as const,
                    mode: "terminal_workspace" as const,
                })),
                projectDraft: {
                    title: "Neighborhood Resource Guide History",
                    stepIds,
                },
            } as any,
        });

        const codeInputs = result.draft.quizDraft as any[];
        expect(codeInputs).toHaveLength(6);
        expect(result.draft.projectDraft?.stepIds).toEqual(stepIds);
        expect(
            codeInputs.every(
                (exercise) =>
                    exercise.recipeType === "shell_task" &&
                    exercise.mode === "terminal_workspace" &&
                    exercise.fixedLanguage === "bash" &&
                    exercise.prompt.includes("press Enter") &&
                    exercise.gitExpectations.repositoryPath === "resource-guide",
            ),
        ).toBe(true);
        expect(
            codeInputs.map((exercise) => exercise.gitExpectations.exactCommitCount),
        ).toEqual([1, 2, 3, 3, 3, 4]);
        expect(
            codeInputs.every((exercise) => {
                const starterPaths = exercise.starterFiles.map((file: any) => file.path);
                const solutionPaths = exercise.solutionFiles.map((file: any) => file.path);
                return (
                    JSON.stringify(starterPaths) === JSON.stringify(solutionPaths) &&
                    starterPaths.includes("main.sh") &&
                    starterPaths.includes(".zoeskoul/setup.sh")
                );
            }),
        ).toBe(true);
        expect(codeInputs[3].gitExpectations.ignoredFiles).toEqual([
            "generated/preview.html",
        ]);
        expect(codeInputs[4].solutionCode).toContain(
            "git mv pages/guide-draft.md pages/getting-help.md",
        );
        expect(codeInputs[5].gitExpectations.commitMessages).toEqual([
            { position: 0, matches: "^Prepare resource guide handoff$" },
            { position: 1, matches: "^Update help desk hours$" },
            { position: 2, matches: "^Add local services page$" },
            { position: 3, matches: "^Start neighborhood resource guide$" },
        ]);
        expect(
            result.report.repairs.filter(
                (repair) => repair.code === "GIT_CODE_INPUT_WORKSPACE_REBUILT",
            ),
        ).toHaveLength(6);
    });


    it("repairs journey-aware exercises inside the declared cumulative repository", async () => {
        const result = await repairGitDraft({
            seed: {
                profileId: "git",
                topicId: "configure-and-initialize-a-repository",
                title: "Configure and Initialize a Repository",
                projectJourney: {
                    journeyId: "guided-community-site",
                    entryMilestone: "ordinary-folder",
                    exitMilestone: "initialized",
                },
                projectJourneys: [
                    {
                        id: "guided-community-site",
                        role: "guided",
                        title: "Community Site",
                        repositoryPath: "community-site",
                        continuity: "course",
                        supportLevel: "guided",
                        exactEditInstructionsRequired: true,
                        milestoneOrder: ["ordinary-folder", "initialized"],
                    },
                ],
                plannedExerciseCounts: {
                    total: 1,
                    dominantKind: "code_input",
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
                title: "Configure and Initialize a Repository",
                summary: "Initialize the cumulative guided repository.",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "try-configure-and-initialize-a-repository-sketch0",
                        kind: "code_input",
                        title: "Initialize Community Site",
                        prompt: "Initialize the prepared folder with `git init -b main`.",
                        hint: "Use the exact initialization command.",
                        help: {
                            concept: "git init creates local repository metadata.",
                            hint_1: "The folder is already prepared.",
                            hint_2: "Use main as the initial branch.",
                        },
                        starterCode: "",
                        solutionCode: "git init -b main",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.gitExpectations.repositoryPath).toBe("community-site");
        expect(exercise.prompt).toContain("community-site/");
        expect(exercise.prompt).not.toContain(".zoeskoul/setup.sh");
        expect(exercise.solutionCode).toBe("git init -b main\n");
        expect(exercise.starterFiles).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: "main.sh" }),
                expect.objectContaining({
                    path: ".zoeskoul/setup.sh",
                    content: expect.stringContaining("community-site"),
                }),
            ]),
        );
        expect(
            exercise.starterFiles.some((file: any) =>
                String(file.content ?? "").includes("project_alpha"),
            ),
        ).toBe(false);
        expect(
            exercise.terminalExpectations.requiredCommands.some(
                ({ pattern }: { pattern: string }) => pattern.includes("zoeskoul/setup"),
            ),
        ).toBe(false);
    });

    it("does not revive the legacy resource-guide capstone for a declared journey", async () => {
        const result = await repairGitDraft({
            seed: {
                profileId: "git",
                topicId: "final-neighborhood-resource-guide-history",
                title: "Final Capstone",
                projectJourney: {
                    journeyId: "independent-neighborhood-guide",
                    entryMilestone: "ordinary-folder",
                    exitMilestone: "first-snapshot",
                },
                projectJourneys: [
                    {
                        id: "independent-neighborhood-guide",
                        role: "capstone",
                        title: "Neighborhood Guide",
                        repositoryPath: "neighborhood-guide",
                        continuity: "topic",
                        supportLevel: "independent",
                        exactEditInstructionsRequired: true,
                        milestoneOrder: ["ordinary-folder", "first-snapshot"],
                    },
                ],
                plannedExerciseCounts: {
                    total: 1,
                    dominantKind: "code_input",
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
                title: "Final Capstone",
                summary: "Start the independent repository.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "try-final-neighborhood-resource-guide-history-sketch0",
                        kind: "code_input",
                        title: "Start Neighborhood Guide",
                        prompt: "Initialize the folder with `git init -b main`.",
                        hint: "Use the exact command.",
                        help: {
                            concept: "Start a fresh local repository.",
                            hint_1: "Use main.",
                            hint_2: "Verify the new repository.",
                        },
                        starterCode: "",
                        solutionCode: "git init -b main",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        const setup = exercise.starterFiles.find(
            (file: any) => file.path === ".zoeskoul/setup.sh",
        )?.content;
        expect(exercise.gitExpectations.repositoryPath).toBe(
            "neighborhood-guide",
        );
        expect(setup).toContain("neighborhood-guide");
        expect(setup).not.toContain("resource-guide");
    });

    it("keeps an ordinary-folder inspection uninitialized and preserves terminal prerequisites", async () => {
        const result = await repairGitDraft({
            seed: {
                profileId: "git",
                topicId: "module-1-field-notes-repository",
                title: "Start Volunteer Hub",
                projectJourney: {
                    journeyId: "parallel-volunteer-hub",
                    entryMilestone: "ordinary-folder",
                    exitMilestone: "ordinary-folder",
                },
                projectJourneys: [
                    {
                        id: "parallel-volunteer-hub",
                        role: "module_project",
                        title: "Volunteer Hub",
                        repositoryPath: "volunteer-hub",
                        continuity: "cross_module",
                        supportLevel: "reapplication",
                        exactEditInstructionsRequired: true,
                        milestoneOrder: ["ordinary-folder", "first-snapshot"],
                    },
                ],
                plannedExerciseCounts: {
                    total: 1,
                    dominantKind: "code_input",
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
                title: "Start Volunteer Hub",
                summary: "Inspect the ordinary project folder.",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "try-git-repo-inspection",
                        kind: "code_input",
                        title: "Inspect the Volunteer Hub Folder",
                        prompt: "Type `pwd` and press Enter. Then type `ls` and press Enter.",
                        hint: "Inspect before initializing.",
                        help: {
                            concept: "A repository starts as an ordinary folder.",
                            hint_1: "Check the current directory.",
                            hint_2: "List the prepared files.",
                        },
                        starterCode: "",
                        solutionCode: "pwd\nls",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        const setup = exercise.starterFiles.find(
            (file: any) => file.path === ".zoeskoul/setup.sh",
        )?.content;
        expect(exercise.solutionCode).toBe("pwd\nls\n");
        expect(exercise.gitExpectations).toEqual({
            repositoryPath: "volunteer-hub",
            repositoryInitialized: false,
        });
        expect(setup).toContain("volunteer-hub");
        expect(setup).not.toContain("git -C \"volunteer-hub\" init");
    });

});
