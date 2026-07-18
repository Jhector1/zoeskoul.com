import { describe, expect, it } from "vitest";
import { getCurriculumProfile, getProfileAdapter } from "../registry.js";
import { bashProfile } from "../bash/profile.js";
import { gitProfile } from "./profile.js";

describe("gitProfile", () => {
    it("reuses the terminal runtime contract without changing the Bash runtime", () => {
        expect(gitProfile.buildModuleRuntimeDefaults()).toEqual(
            bashProfile.buildModuleRuntimeDefaults(),
        );
        expect(gitProfile.defaultLanguage).toBe("bash");
        expect(gitProfile.defaultEntryFileName).toBe("README.md");
        expect(gitProfile.allowedRecipeTypes).toEqual(["shell_task"]);
        expect(gitProfile.shape.profileId).toBe("git");
        expect(bashProfile.shape.profileId).toBe("bash");
    });

    it("owns the Git learning presentation without changing the shared terminal runtime", () => {
        const expected = {
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "default",
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/*"],
                setupScriptPath: ".zoeskoul/setup.sh",
            },
            requires: { files: true, multiFile: true, terminal: true },
        };

        expect(gitProfile.buildModuleServiceDefaults?.()).toEqual(expected);
        expect(
            getProfileAdapter("git").getTopicSeedServiceDefaults?.({
                blueprint: { profileId: "git" } as any,
                module: { slug: "git-module-1", order: 1 },
            }),
        ).toEqual(expected);
    });

    it("inherits the shared terminal workspace and adds only Git repository cwd", () => {
        const manifest = gitProfile.codeInput?.buildManifest({
            messageBase: "quiz.git.init",
            seed: { topicId: "init", profileId: "git" } as any,
            exercise: {
                id: "init-1",
                kind: "code_input",
                title: "Initialize the repository",
                prompt: "Initialize the prepared folder.",
                hint: "Use git init.",
                help: {
                    concept: "A repository begins with git init.",
                    hint_1: "The terminal already opens in the project folder.",
                    hint_2: "Use main as the initial branch.",
                },
                starterCode: "# Use the terminal.\n",
                solutionCode: "git init -b main\n",
                fixedLanguage: "bash",
                recipeType: "shell_task",
                mode: "terminal_workspace",
                starterFiles: [
                    {
                        path: "main.sh",
                        content: "# Use the terminal.\n",
                        language: "bash",
                        isEntry: true,
                        entry: true,
                    },
                    {
                        path: ".zoeskoul/setup.sh",
                        content: "#!/usr/bin/env bash\nmkdir -p trail-journal\n",
                        language: "bash",
                        readOnly: true,
                    },
                    {
                        path: "trail-journal/README.md",
                        content: "# Trail Journal\n",
                        language: "bash",
                    },
                ],
                gitExpectations: {
                    repositoryPath: "trail-journal",
                    repositoryInitialized: true,
                    currentBranch: "main",
                },
            } as any,
        });

        expect((manifest as any)?.serviceOverrides).toMatchObject({
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "default",
            terminalSessionScope: "exercise",
            terminalCwd: "/workspace/trail-journal",
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/*"],
                setupScriptPath: ".zoeskoul/setup.sh",
                workspaceStateKey: expect.stringMatching(/^git-state-v1-/),
            },
            fileActions: {
                enabled: true,
                createFile: true,
                createFolder: true,
                rename: true,
                delete: true,
            },
            requires: { files: true, multiFile: true, terminal: true },
        });
        expect((manifest as any)?.fixtureFiles).toEqual([
            expect.objectContaining({ path: ".zoeskoul/setup.sh" }),
            expect.objectContaining({ path: "trail-journal/README.md" }),
        ]);
        expect((manifest as any)?.workspace?.fixtureFiles).toEqual([
            expect.objectContaining({ path: ".zoeskoul/setup.sh" }),
            expect.objectContaining({ path: "trail-journal/README.md" }),
        ]);
        expect((manifest as any)?.workspace?.entryFilePath).toBe(
            "trail-journal/README.md",
        );
        expect((manifest as any)?.starterFiles).toEqual([
            expect.objectContaining({
                path: "trail-journal/README.md",
                isEntry: true,
                entry: true,
            }),
        ]);
        expect(JSON.stringify(manifest)).not.toContain("main.sh");
        expect(bashProfile.codeInput?.buildManifest).not.toBe(
            gitProfile.codeInput?.buildManifest,
        );
    });

    it("keys the PTY lease from the compiled hidden starting state", () => {
        const build = (setupContent: string) =>
            gitProfile.codeInput?.buildManifest({
                messageBase: "quiz.git.state-key",
                seed: { topicId: "state-key", profileId: "git" } as any,
                exercise: {
                    id: "state-key-1",
                    kind: "code_input",
                    title: "Inspect the repository",
                    prompt: "Inspect the prepared repository.",
                    starterCode: "# Trail Journal\n",
                    solutionCode: "git status\n",
                    fixedLanguage: "bash",
                    recipeType: "shell_task",
                    mode: "terminal_workspace",
                    starterFiles: [
                        {
                            path: ".zoeskoul/setup.sh",
                            content: setupContent,
                            language: "bash",
                            readOnly: true,
                        },
                        {
                            path: "trail-journal/README.md",
                            content: "# Trail Journal\n",
                            language: "markdown",
                        },
                    ],
                    gitExpectations: {
                        repositoryPath: "trail-journal",
                        repositoryInitialized: true,
                    },
                } as any,
            }) as any;

        const first = build("#!/usr/bin/env bash\ngit -C trail-journal init -q -b main\n");
        const same = build("#!/usr/bin/env bash\ngit -C trail-journal init -q -b main\n");
        const changed = build("#!/usr/bin/env bash\ngit -C trail-journal init -q -b trunk\n");

        expect(first.ideConfig.terminalBootstrap.workspaceStateKey).toBe(
            same.ideConfig.terminalBootstrap.workspaceStateKey,
        );
        expect(first.ideConfig.terminalBootstrap.workspaceStateKey).not.toBe(
            changed.ideConfig.terminalBootstrap.workspaceStateKey,
        );
    });

    it("registers the Git profile, adapter, and code family services path", () => {
        expect(getCurriculumProfile("git").id).toBe("git");
        expect(getProfileAdapter("git").id).toBe("git");
    });

    it("repairs Git drafts back to the shared terminal workspace contract", () => {
        const repaired = gitProfile.codeInput?.repairDraft?.({
            seed: { topicId: "status", profileId: "git" } as any,
            exercise: {
                id: "status-1",
                kind: "code_input",
                title: "Inspect status",
                prompt: "Run git status.",
                starterCode: "",
                recipeType: "fixed_tests",
                mode: "stdout",
            } as any,
        });

        expect(repaired).toMatchObject({
            fixedLanguage: "bash",
            recipeType: "shell_task",
            mode: "terminal_workspace",
        });
    });

    it("repairs missing Git grading evidence from safe authored solution commands", () => {
        const repaired = gitProfile.codeInput?.repairDraft?.({
            seed: { topicId: "status", profileId: "git" } as any,
            exercise: {
                id: "status-1",
                kind: "code_input",
                title: "Inspect status",
                prompt: "Type git status and press Enter.",
                starterCode: "# Use the terminal for this Git task.\n",
                solutionCode: "# Inspect the repository\ngit status\n",
                recipeType: "shell_task",
                mode: "terminal_workspace",
            } as any,
        });

        expect(repaired?.terminalExpectations).toEqual({
            requiredCommands: [
                {
                    pattern: "^git\\s+status$",
                    message: "Run `git status`, then check your answer again.",
                },
            ],
        });

        const manifest = gitProfile.codeInput?.buildManifest({
            messageBase: "quiz.git.status",
            seed: { topicId: "status", profileId: "git" } as any,
            exercise: repaired!,
        });
        expect(manifest?.terminalExpectations).toEqual({
            requiredCommands: [
                {
                    pattern: "^git\\s+status$",
                    message:
                        "@:quiz.git.status.terminalExpectations.requiredCommands.0.message",
                },
            ],
        });
    });

    it("preserves authored repository-state grading instead of adding command fallback", () => {
        const gitExpectations = {
            repositoryInitialized: true,
            cleanWorkingTree: true,
        };
        const repaired = gitProfile.codeInput?.repairDraft?.({
            seed: { topicId: "commit", profileId: "git" } as any,
            exercise: {
                id: "commit-1",
                kind: "code_input",
                title: "Create a commit",
                prompt: "Commit the staged file.",
                starterCode: "# Use the terminal for this Git task.\n",
                solutionCode: 'git commit -m "Save notes"\n',
                recipeType: "shell_task",
                mode: "terminal_workspace",
                gitExpectations,
            } as any,
        });

        expect(repaired?.gitExpectations).toEqual(gitExpectations);
        expect(repaired?.terminalExpectations).toBeUndefined();
    });

    it("tells the generator to grade repository state rather than hashes", () => {
        const rules =
            gitProfile.renderAuthoringPromptRules?.({
                seed: {
                    plannedExerciseCounts: {
                        counts: { code_input: 2 },
                    },
                } as any,
                shape: gitProfile.shape,
            }) ?? [];
        const joined = rules.join("\n");

        expect(joined).toContain("exactly 2 Git code_input");
        expect(joined).toMatch(/shared authoring exercise collection/);
        expect(joined).toMatch(/quizzesDoNotUseCodeInput policy applies only to the final learner quiz card/);
        expect(joined).toMatch(/Never replace a required Git code_input with fill_blank_choice/);
        expect(joined).toMatch(/one distinct try-<topic-id>-sketchN code_input per sketch/);
        expect(joined).toMatch(/gitExpectations/);
        expect(joined).toMatch(/repository state/i);
        expect(joined).toMatch(/local bare repositories/i);
        expect(joined).toMatch(/Do not assert exact commit hashes/i);
        expect(joined).toMatch(/press Enter/i);
        expect(joined).toMatch(/real project file/i);
        expect(joined).toMatch(/never create a synthetic main\.sh/i);
        expect(joined).toMatch(/editor, explorer, and terminal visible together/i);
        expect(joined).toMatch(/every Git code_input as an isolated workspace/i);
        expect(joined).toMatch(/instead of relying on a previous exercise or PTY session/i);
        expect(joined).toContain('body explicitly begins with "Worked example:"');
        expect(joined).toMatch(/conceptualOnly topic omits code_input practice/i);
        expect(joined).toMatch(/course introduction and the worked-example teaching sketch as separate/i);
    });

    it("compiles Git expectations into the existing hidden shell checker", () => {
        const exercise = gitProfile.codeInput?.buildManifest({
            messageBase: "quiz.git.first-commit",
            seed: { topicId: "first-commit", profileId: "git" } as any,
            exercise: {
                id: "first-commit-1",
                kind: "code_input",
                title: "Create the first commit",
                prompt: "Initialize the repository and commit README.md.",
                hint: "Inspect the repository with git status.",
                help: {
                    concept: "Git stores snapshots as commits.",
                    hint_1: "Initialize the repository.",
                    hint_2: "Stage README.md before committing.",
                },
                fixedLanguage: "bash",
                recipeType: "shell_task",
                mode: "terminal_workspace",
                entryFilePath: "main.sh",
                starterCode: "# Use the terminal for this Git task.\n",
                solutionCode: "git init\n",
                workspaceExpectations: {
                    requiredFiles: ["README.md"],
                },
                terminalExpectations: {
                    requiredCommands: [{ pattern: "^git\\s+status$" }],
                },
                hiddenShellCheck: {
                    script: "test -f README.md",
                    timeoutMs: 5000,
                },
                gitExpectations: {
                    repositoryInitialized: true,
                    currentBranch: "main",
                    exactCommitCount: 1,
                    cleanWorkingTree: true,
                    trackedFiles: ["README.md"],
                    commitMessages: [
                        { position: 0, matches: "^Add README$" },
                    ],
                },
            },
        });

        expect(exercise?.recipe).toEqual({
            type: "shell_task",
            mode: "terminal_workspace",
            instructions: "@:quiz.git.first-commit.prompt",
        });
        expect(exercise?.language).toBe("bash");
        expect(exercise?.workspaceExpectations).toEqual({
            requiredFiles: ["README.md"],
        });
        expect(exercise?.hiddenShellCheck?.script).toContain(
            "test -f README.md",
        );
        expect(exercise?.hiddenShellCheck?.script).toContain(
            "rev-parse --is-inside-work-tree",
        );
        expect(exercise?.hiddenShellCheck?.script).toContain(
            "rev-list --count HEAD",
        );
        expect(exercise?.hiddenShellCheck?.script).toContain(
            "ls-files --error-unmatch",
        );
        expect(exercise?.hiddenShellCheck?.script).toContain(
            "grep -Eq",
        );
    });

    it("requires Git exercises to remain terminal workspace shell tasks", () => {
        const issues = gitProfile.validateTopicBundle({
            topicId: "git-topic",
            subjectSlug: "git-foundations",
            moduleSlug: "git-1",
            sectionSlug: "git-1-repository-workflow-1",
            prefix: "git1",
            minutes: 15,
            topic: {
                labelKey: "topics.git.label",
                summaryKey: "topics.git.summary",
            },
            cards: [],
            sketches: [],
            exercises: [
                {
                    id: "bad-git-code",
                    kind: "code_input",
                    purpose: "project",
                    weight: 1,
                    messageBase: "quiz.git.bad",
                    language: "bash",
                    starterCode: "",
                    recipe: { type: "shell_task", mode: "stdout" },
                },
            ],
        } as any);

        expect(issues.join("\n")).toMatch(/terminal_workspace/);
    });
});
