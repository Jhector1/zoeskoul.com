import { afterEach, describe, expect, it } from "vitest";
import {
    pythonShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { buildTopicAuthoringDraftPrompt } from "./buildTopicAuthoringDraftPrompt.js";

afterEach(() => {
    unregisterCurriculumProfile("testlang");
});

describe("buildTopicAuthoringDraftPrompt", () => {
    it("includes planned exercise counts from the seed", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                exercisePolicy: {
                    source: "module_spec",
                    mix: {
                        single_choice: 0.2,
                        multi_choice: 0.2,
                        drag_reorder: 0.1,
                        fill_blank_choice: 0.3,
                        code_input: 0.2,
                    },
                },
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "fill_blank_choice",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 2,
                        code_input: 1,
                    },
                },
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Required exercise counts");
        expect(prompt.system).toContain("fill_blank_choice: 2");
    });
    it("does not include SQL-specific hint wording for Python authoring prompts", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).not.toMatch(/\bSQL query\b/i);
        expect(prompt.system).not.toMatch(/\bWHERE clause\b/i);
        expect(prompt.system).toContain(
            "Do not give the final answer, final option letter, final exact filled value, or full code solution in hints.",
        );
    });
    it("includes sql dataset rules for sql profile seeds", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("SQL dataset grounding rules:");
        expect(prompt.system).toContain('For SQL code_input, recipeType must be "sql_query".');
    });

    it("includes fixed test guidance for non-sql code_input exercises", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                workspacePolicy: {
                    workspace: {
                        name: "Browser code runner",
                        ui: {
                            editorLabel: "code editor",
                            runButtonLabel: "Run",
                            outputPanelLabel: "output panel",
                        },
                        capabilities: {
                            terminal: { enabled: false },
                            filesystem: { enabled: false },
                            multiFileProjects: { enabled: false },
                            packageInstall: { enabled: false },
                        },
                    },
                    preferredActionLanguage: [],
                    forbiddenActionLanguage: [],
                    notes: [],
                },
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain(
            'For Python code_input, prefer recipeType "fixed_tests" when the exercise is a normal runnable program.',
        );
        expect(prompt.system).toContain(
            "include at least 2 meaningful and distinct stdin/stdout tests.",
        );
        expect(prompt.system).toContain(
            "Do not create fixed_tests code_input exercises that only print one fixed literal and do not read stdin.",
        );
    });

    it("includes thin fixed test retry feedback with exact failing exercise ids", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                workspacePolicy: {
                    workspace: {
                        name: "Browser code runner",
                        ui: {
                            editorLabel: "code editor",
                            runButtonLabel: "Run",
                            outputPanelLabel: "output panel",
                        },
                        capabilities: {
                            terminal: { enabled: false },
                            filesystem: { enabled: false },
                            multiFileProjects: { enabled: false },
                            packageInstall: { enabled: false },
                        },
                    },
                    preferredActionLanguage: [],
                    forbiddenActionLanguage: [],
                    notes: [],
                },
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
            retry: {
                attempt: 1,
                maxRetries: 2,
                previousErrorCode: "CURRICULUM_QUALITY_GATE_FAILED",
                previousErrorMessage: 'Exercise "quiz5" has fewer than 2 fixed test cases.',
                qualityIssues: [
                    {
                        code: "THIN_FIXED_TEST_COVERAGE",
                        exerciseId: "quiz5",
                        message: 'Exercise "quiz5" has fewer than 2 fixed test cases.',
                    },
                ],
            },
        });

        expect(prompt.system).toContain("Specific issues from the previous attempt:");
        expect(prompt.system).toContain('quiz5: Exercise "quiz5" has fewer than 2 fixed test cases.');
        expect(prompt.system).toContain("Every fixed_tests Python code_input needs at least 2 meaningful and distinct tests.");
        expect(prompt.system).toContain("Failing exercise ids from the previous attempt:");
        expect(prompt.system).toContain("quiz5");
        expect(prompt.system).toContain("Forbidden learner-facing workspace terms: Terminal, command line, shell, console.");
        expect(prompt.system).toContain('Do not use "Terminal" even as a distractor option.');
    });

    it("includes unsafe fixed-tests retry guidance from prior repair issues", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                workspacePolicy: {
                    workspace: {
                        name: "Browser code runner",
                        ui: {
                            editorLabel: "code editor",
                            runButtonLabel: "Run",
                            outputPanelLabel: "output panel",
                        },
                        capabilities: {
                            terminal: { enabled: false },
                            filesystem: { enabled: false },
                            multiFileProjects: { enabled: false },
                            packageInstall: { enabled: false },
                        },
                    },
                    preferredActionLanguage: [],
                    forbiddenActionLanguage: [],
                    notes: [],
                },
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
            retry: {
                attempt: 1,
                maxRetries: 2,
                previousErrorCode: "CRITIQUE_VALIDATION_FAILED",
                previousErrorMessage: 'Exercise "quiz5" is invalid as fixed_tests code_input because it does not read stdin.',
                qualityIssues: [
                    {
                        code: "PYTHON_FIXED_TEST_REPAIR_UNSAFE",
                        exerciseId: "quiz5",
                        message: 'Exercise "quiz5" is invalid as fixed_tests code_input because it does not read stdin.',
                    },
                ],
            },
        });

        expect(prompt.system).toContain("These exercise ids were invalid as fixed_tests code_input:");
        expect(prompt.system).toContain("Replace them with non-code exercises or regenerate them as stdin-based code_input with at least 2 tests.");
        expect(prompt.system).toContain("Do not produce static print-only code_input tasks with one test.");
    });

    it("does not inject SQL or Python code_input rules into a profile that does not opt in", () => {
        const testlangProfile: CourseProfile = {
            id: "testlang",
            shape: {
                ...pythonShape,
                profileId: "testlang",
            },
            allowedExerciseKinds: ["single_choice", "code_input"],
            allowedRecipeTypes: ["fixed_tests"],
            buildModuleRuntimeDefaults() {
                return { kind: "code", language: "testlang" };
            },
            codeInput: {
                defaultStarter() {
                    return "// Write your testlang answer below\n";
                },
                defaultRecipeType() {
                    return "fixed_tests";
                },
                buildManifest() {
                    throw new Error("Not needed");
                },
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        };

        registerCurriculumProfile(testlangProfile);

        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "testlang",
                exercisePolicy: undefined,
            } as any,
            shape: testlangProfile.shape,
        });

        expect(prompt.system).not.toContain("SQL dataset grounding rules:");
        expect(prompt.system).not.toContain('prefer code_input recipeType "fixed_tests"');
        expect(prompt.system).not.toContain('code_input recipeType must be "sql_query"');
    });

    it("renders exercise kind rules from a shared generic-to-specific contract", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Exercise-kind contract (generic to specific):");
        expect(prompt.system).toContain(
            "single_choice: course-agnostic knowledge check with exactly one correct answer.",
        );
        expect(prompt.system).toContain(
            "multi_choice: course-agnostic knowledge check with two or more genuinely correct answers when appropriate.",
        );
        expect(prompt.system).toContain(
            "code_input: implementation exercise whose runtime/recipe details may vary by profile, language, and execution model.",
        );
    });

    it("includes teaching-quality guidance for sketches and programming examples", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Teaching-quality rules for sketchBlocks in every subject:");
        expect(prompt.system).toContain("Include at least one concrete worked example");
        expect(prompt.system).toContain("Extra teaching rules for programming-family profiles:");
        expect(prompt.system).toContain("explain it step by step or line by line");
        expect(prompt.system).toContain("Include a small 'Try it yourself' follow-up");
    });

    it("is deterministic for the same prompt builder inputs", () => {
        const args = {
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
                plannedExerciseCounts: {
                    total: 4,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 1,
                        code_input: 1,
                    },
                },
            } as any,
            shape: {} as any,
        };

        const first = buildTopicAuthoringDraftPrompt(args);
        const second = buildTopicAuthoringDraftPrompt(args);

        expect(first).toEqual(second);
    });
});
