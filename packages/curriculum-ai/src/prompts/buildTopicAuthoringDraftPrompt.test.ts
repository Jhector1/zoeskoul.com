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
        expect(prompt.system).toContain(
            "every later solutionCode must be one complete cumulative SQL statement",
        );
        expect(prompt.system).toContain(
            "Never concatenate multiple SELECT statements",
        );
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
        expect(prompt.system).toContain(
            '[THIN_FIXED_TEST_COVERAGE] quiz5: Exercise "quiz5" has fewer than 2 fixed test cases.',
        );
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
        expect(prompt.system).toContain(
            "If a code_input exercise cannot support two meaningful fixed tests, replace it with a non-code exercise or rewrite it into a stdin-based task.",
        );
        expect(prompt.system).toContain(
            'switch that exercise to recipeType "semantic"',
        );
        expect(prompt.system).toContain("Do not produce static print-only code_input tasks with one test.");
        expect(prompt.system).toContain("For class/object/method tasks, prefer semantic checks such as defines_class, constructible, instance_attributes, function_returns, method_returns, method_sequence_returns, or attribute_sequence_equals instead of stdout tests.");
    });

    it("renders active SQL duplicate repair guidance with the failing exercise id", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                topicId: "foreign-keys-and-references",
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryItPlacement: "all_sketches",
                },
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
            retry: {
                attempt: 1,
                maxRetries: 2,
                previousErrorCode: "SEMANTIC_VALIDATION_FAILED",
                previousErrorMessage:
                    'Try It exercise "try-foreign-keys-and-references-sketch0" reproduces a worked example.',
                qualityIssues: [
                    {
                        code: "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
                        exerciseId:
                            "try-foreign-keys-and-references-sketch0",
                        message:
                            'Try It exercise "try-foreign-keys-and-references-sketch0" reproduces the worked example in "Verifying FOREIGN KEY Relationships" (sketch2).',
                    },
                ],
            },
        });

        expect(prompt.system).toContain(
            "[WORKED_EXAMPLE_TRY_IT_DUPLICATE] try-foreign-keys-and-references-sketch0:",
        );
        expect(prompt.system).toContain(
            "ACTIVE REPAIR — worked-example and Try It duplication:",
        );
        expect(prompt.system).toContain(
            "try-foreign-keys-and-references-sketch0",
        );
        expect(prompt.system).toContain(
            "Update the exercise prompt, solutionCode, checkSql, starterCode, starterFiles/query.sql, and solutionFiles/query.sql coherently",
        );
        expect(prompt.system).toContain(
            "normalized SELECT/FROM/JOIN/WHERE/GROUP BY expectation",
        );
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
        expect(prompt.system).toContain("Write connected, book-like teaching prose");
        expect(prompt.system).toContain("Define the named concept in the first paragraph");
        expect(prompt.system).toContain("Make cardTitle and title complementary but different");
        expect(prompt.system).toContain("Include at least one concrete worked example");
        expect(prompt.system).toContain("different scenario, entity/record set, and concrete values");
        expect(prompt.system).toContain("every solutionFiles[].content value");
        expect(prompt.system).toContain("Extra teaching rules for programming-family profiles:");
        expect(prompt.system).toContain("explain it step by step or line by line");
        expect(prompt.system).toContain("Do not add a literal 'Try it yourself' sentence to sketchBlocks");
    });

    it("aligns all_sketches lesson count with the exact code_input plan", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                sectionRole: "lesson",
                practice: {
                    tryIt: true,
                    requiresTryIt: true,
                    tryItPlacement: "all_sketches",
                },
                plannedExerciseCounts: {
                    total: 8,
                    dominantKind: "single_choice",
                    counts: {
                        single_choice: 2,
                        multi_choice: 2,
                        drag_reorder: 1,
                        fill_blank_choice: 1,
                        code_input: 2,
                    },
                },
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Generate exactly 2 sketchBlocks for this lesson");
        expect(prompt.system).toContain("Generate exactly 2 matching code_input items");
        expect(prompt.system).toContain("try-<topic-id>-sketch0 through try-<topic-id>-sketch1");
        expect(prompt.system).toContain("Do not generate extra teaching sketches");
    });

    it("renders the authored final-capstone brief and exact step ladder", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                moduleRole: "capstone",
                sectionRole: "capstone",
                projectBrief: {
                    scenario: "Build one all-department participation report.",
                    role: "SQL reporting specialist",
                    workspace: "Browser SQL editor and ERD",
                    deliverable: "A complete participation report.",
                    stepCountTarget: 4,
                    flow: "progressive",
                    requirements: ["Preserve every department."],
                    stepLadder: [
                        { step: 1, title: "Start", requirement: "Build the all-department grain." },
                        { step: 2, title: "Count", requirement: "Add related-row counts." },
                        { step: 3, title: "Validate", requirement: "Add distinct students." },
                        { step: 4, title: "Deliver", requirement: "Label and rank the report." },
                    ],
                },
                generationTargets: {
                    quizBankMin: 0,
                    quizBankTarget: 0,
                    quizVisibleDefault: 0,
                    quizVisibleMax: 0,
                    projectCodeInputMin: 4,
                    projectCodeInputTarget: 4,
                    projectCodeInputMax: 4,
                    maxAttempts: null,
                },
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain(
            "The authored projectBrief is the source of truth",
        );
        expect(prompt.system).toContain(
            "Generate exactly 4 project code_input step(s), no more and no fewer.",
        );
        expect(prompt.system).toContain(
            "Step 4: Deliver — Label and rank the report.",
        );
        expect(prompt.user).toContain('"stepCountTarget": 4');
    });


    it("requires worked examples and Try It exercises to have different expectations", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                topicId: "inner-join-with-on",
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain(
            "A Try It must not ask the learner to reproduce any fenced worked example",
        );
        expect(prompt.system).toContain(
            "Every Try It must change at least one meaningful expectation",
        );
        expect(prompt.system).toContain(
            "aliases, or ORDER BY alone do not make a different exercise",
        );
        expect(prompt.system).toContain(
            "self-audit every code_input solutionCode against every fenced worked example",
        );
        expect(prompt.system).toContain(
            "keep prompt, solutionCode, checkSql, starterFiles/query.sql, and solutionFiles/query.sql aligned",
        );
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

describe("Linux/Bash prompt policy wording", () => {
    it("makes clear code_input belongs in quizDraft authoring", () => {
        const source = buildTopicAuthoringDraftPrompt({
            locale: "en",
            shape: {} as any,
            seed: {
                profileId: "bash",
                topicId: "what-the-terminal-is",
                title: "What the Terminal Is",
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "code_input",
                    counts: {
                        code_input: 3,
                        fill_blank_choice: 2,
                    },
                },
                exercisePolicy: {
                    source: "test",
                    mix: {
                        single_choice: 0,
                        multi_choice: 0,
                        drag_reorder: 0,
                        fill_blank_choice: 0.4,
                        code_input: 0.6,
                    },
                },
                generationTargets: {
                    quizBankMin: 2,
                    quizBankTarget: 2,
                    quizVisibleDefault: 2,
                    quizVisibleMax: 2,
                    projectCodeInputMin: 3,
                    projectCodeInputTarget: 3,
                    projectCodeInputMax: 3,
                    maxAttempts: null,
                },
            } as any,
        }).system;

        expect(source).toContain("quizDraft is an authoring array, not the final learner quiz");
        expect(source).toContain("generate exactly 3 code_input exercises inside quizDraft");
        expect(source).toContain("put required code_input authoring items inside quizDraft");
        expect(source).toContain('recipeType "shell_task"');
        expect(source).toContain('mode "terminal_workspace"');
        expect(source).toContain('Do not use checker.defaultRecipe "workspace_expectations"');
        expect(source).toContain("per-exercise terminal workspaces");
    });
});
