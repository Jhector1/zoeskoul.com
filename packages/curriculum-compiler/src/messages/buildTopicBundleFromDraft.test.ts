import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
    getCurriculumProfile,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile, ProjectProfileConfig,
} from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";

function makeShapePack() {
    return {
        profileId: "sql",
        subjectManifest: {
            moduleSlug: (moduleOrder: number) => `sql_module_${moduleOrder}`,
            sectionSlug: (moduleOrder: number, sectionOrder: number) =>
                `section_${moduleOrder}_${sectionOrder}`,
            modulePrefix: (moduleOrder: number) => `sql${moduleOrder}`,
            keyPatterns: {
                topicCardTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    cardId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.cards.${cardId}.title`,
                topicProjectStepTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    stepId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.project.${stepId}.title`,
                sketchTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    sketchId: string,
                ) => `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.title`,
                sketchBodyKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    sketchId: string,
                ) => `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.bodyMarkdown`,
                topicLabelKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.label`,
                topicSummaryKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.summary`,
                exerciseMessageBase: (exerciseId: string) => `quiz.${exerciseId}`,
            },
        },
    } as any;
}

function makeSeed() {
    return {
        subjectSlug: "sql",
        profileId: "sql",

        moduleSlug: "sql_module_0",
        modulePrefix: "sql0",
        moduleOrder: 0,

        sectionSlug: "section_0_1",
        sectionOrder: 1,

        topicId: "what-sql-means",
        order: 1,
        title: "What SQL Means",
        summary: "Intro topic",
        minutes: 15,

        sourceLocale: "en",
        targetLocales: [],

        moduleRuntimeDefaults: {
            kind: "sql",
            datasetId: "students_intro",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        },
    } as any;
}
function makeProjectConfig(
    overrides: Partial<ProjectProfileConfig> = {},
): ProjectProfileConfig {
    return {
        preferredProjectExerciseKind: "code_input",
        minStepCount: 3,
        targetStepCount: 3,
        allowReveal: true,
        tryItDefault: {
            enabled: true,
            sketchIndex: 0,
            allowReveal: true,
        },
        projectFlowDefault: "progressive",
        projectTitle: "Module Project",
        projectStepLabel: "Project step",
        startPromptPrefix: "Start the module project.",
        continuePromptPrefix:
            "Continue the same module project from the previous working step.",
        helpConcept:
            "This module project is progressive. Each step starts from the previous working solution and adds one focused feature.",
        ...overrides,
    };
}
function makePythonShapePack() {
    return {
        profileId: "python",
        subjectManifest: {
            moduleSlug: (moduleOrder: number) => `python-${moduleOrder}`,
            sectionSlug: (moduleOrder: number, sectionOrder: number) =>
                `python-${moduleOrder}-section-${sectionOrder}`,
            modulePrefix: (moduleOrder: number) => `py${moduleOrder}`,
            keyPatterns: {
                topicCardTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    cardId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.cards.${cardId}.title`,
                topicProjectStepTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    stepId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.project.${stepId}.title`,
                sketchTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    sketchId: string,
                ) => `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.title`,
                sketchBodyKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    sketchId: string,
                ) => `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.bodyMarkdown`,
                topicLabelKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.label`,
                topicSummaryKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.summary`,
                exerciseMessageBase: (exerciseId: string) => `quiz.${exerciseId}`,
            },
        },
    } as any;
}
function makePythonSeed() {
    return {
        profileId: "python",
        subjectSlug: "python-for-beginners",

        moduleSlug: "python-1",
        modulePrefix: "py1",
        moduleOrder: 1,

        sectionSlug: "python-1-section-1",
        sectionOrder: 1,

        topicId: "read-and-add",
        order: 1,
        title: "Read and Add",
        summary: "Read input and add one.",
        minutes: 15,

        sourceLocale: "en",
        targetLocales: [],

        moduleRuntimeDefaults: {
            kind: "code",
            language: "python",
        },
    } as any;
}

function makeDraftWithExercise(exercise: any) {
    return {
        title: "What SQL Means",
        summary: "Intro topic",
        minutes: 15,
        sketchBlocks: [
            {
                id: "sketch-1",
                title: "Sketch 1",
                bodyMarkdown: "Body 1",
            },
        ],
        quizDraft: [exercise],
    } as any;
}

function makeMultiSketchTryItDraft(sketchCount = 3) {
    return {
        title: "Attributes and Init",
        summary: "Initialize object state.",
        minutes: 28,
        sketchBlocks: Array.from({ length: sketchCount }, (_, index) => ({
            id: `sketch-${index + 1}`,
            title: `Sketch ${index + 1}`,
            bodyMarkdown: `Body ${index + 1}`,
        })),
        quizDraft: [
            {
                id: "ex1",
                kind: "code_input",
                title: "Exercise 1",
                prompt: "Prompt ex1",
                starterCode: "# start\n",
                solutionCode: "print('ex1')\n",
                tests: [
                    { stdout: "ex1\n", match: "exact" },
                    { stdout: "ex1\n", match: "exact" },
                ],
                hint: "Hint",
                help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
            },
            {
                id: "ex6",
                kind: "code_input",
                title: "Exercise 6",
                prompt: "Prompt ex6",
                starterCode: "# start\n",
                solutionCode: "print('ex6')\n",
                tests: [
                    { stdout: "ex6\n", match: "exact" },
                    { stdout: "ex6\n", match: "exact" },
                ],
                hint: "Hint",
                help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
            },
            {
                id: "ex11",
                kind: "code_input",
                title: "Exercise 11",
                prompt: "Prompt ex11",
                starterCode: "# start\n",
                solutionCode: "print('ex11')\n",
                tests: [
                    { stdout: "ex11\n", match: "exact" },
                    { stdout: "ex11\n", match: "exact" },
                ],
                hint: "Hint",
                help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
            },
        ],
    } as any;
}

afterEach(() => {
    unregisterCurriculumProfile("project-single-choice");
    unregisterCurriculumProfile("practice-single-choice");
});

describe("buildTopicBundleFromDraft messageBase integration", () => {
    it("derives a fully qualified messageBase from exercise id when messageBase is missing", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: makeSeed(),

            draft: makeDraftWithExercise({
                id: "single-1",
                kind: "single_choice",
                title: "What is a table?",
                prompt: "Which choice best describes a table?",
                hint: "Think about stored data.",
                help: {
                    concept: "A table stores related data.",
                    hint_1: "Think about structure.",
                    hint_2: "Choose the storage structure.",
                },
                options: ["A", "B", "C", "D"],
                correctOptionIds: ["a"],
            }),
        });

        expect(bundle.exercises).toHaveLength(1);
        expect(bundle.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1",
        );
    });

    it("preserves a local messageBase override but compiles it to a fully qualified one", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: makeSeed(),

            draft: makeDraftWithExercise({
                id: "single-1",
                messageBase: "quiz.table-definition",
                kind: "single_choice",
                title: "What is a table?",
                prompt: "Which choice best describes a table?",
                hint: "Think about stored data.",
                help: {
                    concept: "A table stores related data.",
                    hint_1: "Think about structure.",
                    hint_2: "Choose the storage structure.",
                },
                options: ["A", "B", "C", "D"],
                correctOptionIds: ["a"],
            }),
        });

        expect(bundle.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.table-definition",
        );
    });

    it("emits topic bundle runtimeDefaults from SQL module runtime defaults", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: makeSeed(),
            draft: makeDraftWithExercise({
                id: "single-1",
                kind: "single_choice",
                title: "What is a table?",
                prompt: "Prompt",
                hint: "Hint",
                help: {
                    concept: "Concept",
                    hint_1: "Hint 1",
                    hint_2: "Hint 2",
                },
                options: ["A", "B"],
                correctOptionIds: ["a"],
            }),
        });

        expect(bundle.runtimeDefaults).toMatchObject({
            kind: "sql",
            datasetId: "students_intro",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        });
    });

    it("emits SQL code_input runtime metadata alongside recipe dataset", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: {
                ...makeSeed(),
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "students_intro",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                    showSchema: true,
                    showErd: true,
                    showChen: false,
                },
            },
            draft: makeDraftWithExercise({
                id: "sql-ex-1",
                kind: "code_input",
                title: "Write a query",
                prompt: "Prompt",
                starterCode: "SELECT * FROM students;",
                solutionCode: "SELECT * FROM students;",
                datasetId: "students_intro",
            }),
        });

        const exercise = bundle.exercises[0];
        expect(exercise?.kind).toBe("code_input");
        expect((exercise as any)?.recipe?.datasetId).toBe("students_intro");
        expect((exercise as any)?.runtime).toMatchObject({
            kind: "sql",
            datasetId: "students_intro",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
            showSchema: true,
            showErd: true,
            showChen: false,
            supportsTerminal: false,
            supportsMultiFile: false,
            supportsFileSystem: false,
        });
    });

    it("does not emit SQL runtime metadata for Python code_input", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: makePythonSeed(),
            draft: makeDraftWithExercise({
                id: "py-ex-1",
                kind: "code_input",
                title: "Read and add",
                prompt: "Prompt",
                starterCode: "a = int(input())",
                solutionCode: "a = int(input())\nprint(a + 1)",
                recipeType: "fixed_tests",
                tests: [
                    { stdin: "1\n", stdout: "2\n", match: "exact" },
                    { stdin: "4\n", stdout: "5\n", match: "exact" },
                ],
            }),
        });

        const exercise = bundle.exercises[0];
        expect(exercise?.kind).toBe("code_input");
        expect((exercise as any)?.runtime).toBeUndefined();
        expect((exercise as any)?.recipe?.type).toBe("fixed_tests");
    });

    it("builds bash shell_task manifests additively", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: makePythonSeed(),
            draft: makeDraftWithExercise({
                id: "linux-course-1-terminal-lab",
                kind: "code_input",
                title: "Create the Linux lab folders",
                prompt: "Use the terminal to create linux-lab/notes/today.txt.",
                starterCode: "#!/usr/bin/env bash\n",
                solutionCode: "mkdir -p linux-lab/notes\ntouch linux-lab/notes/today.txt\n",
                fixedLanguage: "bash",
                recipeType: "shell_task",
                mode: "terminal_workspace",
                instructions: "Use the terminal to create linux-lab/notes/today.txt.",
                entryFilePath: "README.md",
                starterFiles: [
                    {
                        path: "README.md",
                        content: "Use the terminal to create linux-lab/notes/today.txt",
                        entry: true,
                    },
                ],
                workspaceExpectations: {
                    requiredFolders: ["linux-lab", "linux-lab/notes"],
                    requiredFiles: ["linux-lab/notes/today.txt"],
                },
            } as any),
        });

        const exercise = bundle.exercises[0] as any;
        expect(exercise.kind).toBe("code_input");
        expect(exercise.language).toBe("bash");
        expect(exercise.recipe).toEqual({
            type: "shell_task",
            mode: "terminal_workspace",
            instructions: "Use the terminal to create linux-lab/notes/today.txt.",
        });
        expect(exercise.workspace).toMatchObject({
            entryFilePath: "README.md",
            starterFiles: [
                {
                    path: "README.md",
                    content: "Use the terminal to create linux-lab/notes/today.txt",
                    entry: true,
                },
            ],
        });
        expect(exercise.workspaceExpectations).toEqual({
            requiredFolders: ["linux-lab", "linux-lab/notes"],
            requiredFiles: ["linux-lab/notes/today.txt"],
        });
    });

    it("throws if two exercises in the same topic reuse the same local messageBase", () => {
        const draft = {
            title: "What SQL Means",
            summary: "Intro topic",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    messageBase: "quiz.same",
                    kind: "single_choice",
                    title: "Q1",
                    prompt: "Prompt 1",
                    hint: "Hint 1",
                    help: {
                        concept: "Concept 1",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    options: ["A", "B"],
                    correctOptionIds: ["a"],
                },
                {
                    id: "multi-1",
                    messageBase: "quiz.same",
                    kind: "multi_choice",
                    title: "Q2",
                    prompt: "Prompt 2",
                    hint: "Hint 2",
                    help: {
                        concept: "Concept 2",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    options: ["A", "B"],
                    correctOptionIds: ["a"],
                },
            ],
        } as any;

        expect(() =>
            buildTopicBundleFromDraft({
                shape: makeShapePack(),
                seed: makeSeed(),

                draft,
            }),
        ).toThrow(/Duplicate messageBase/i);
    });

    it("allows the same local messageBase in different topics because the compiled qualified keys differ", () => {
        const exercise = {
            id: "single-1",
            messageBase: "quiz.same",
            kind: "single_choice",
            title: "Q1",
            prompt: "Prompt 1",
            hint: "Hint 1",
            help: {
                concept: "Concept 1",
                hint_1: "Hint 1",
                hint_2: "Hint 2",
            },
            options: ["A", "B"],
            correctOptionIds: ["a"],
        };

        const first = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: {
                ...makeSeed(),
                topicId: "topic-a",
            },

            draft: makeDraftWithExercise(exercise),
        });

        const second = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: {
                ...makeSeed(),
                topicId: "topic-b",
            },

            draft: makeDraftWithExercise(exercise),
        });

        expect(first.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.topic-a.quiz.same",
        );
        expect(second.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.topic-b.quiz.same",
        );
        expect(first.exercises[0]?.messageBase).not.toBe(
            second.exercises[0]?.messageBase,
        );
    });

    it("publishes programming code_input as fixed_tests using explicit authoring tests", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: makePythonSeed(),

            draft: makeDraftWithExercise({
                id: "code-1",
                kind: "code_input",
                title: "Read and add",
                prompt: "Read a number and print the number plus one.",
                starterCode: "n = int(input())\n# your code\n",
                solutionCode: "n = int(input())\nprint(n + 1)",
                tests: [
                    { stdin: "3\n", stdout: "4\n", match: "exact" },
                    { stdin: "8\n", stdout: "9\n", match: "exact" },
                ],
                hint: "Convert the input before adding.",
                help: {
                    concept: "Use int(input()) for numeric input.",
                    hint_1: "Store the input in a variable.",
                    hint_2: "Print the final result.",
                },
            }),
        });

        expect(bundle.exercises[0]).toMatchObject({
            kind: "code_input",
            language: "python",
            recipe: {
                type: "fixed_tests",
                tests: [
                    { stdin: "3\n", stdout: "4\n", match: "exact" },
                    { stdin: "8\n", stdout: "9\n", match: "exact" },
                ],
                solutionCode: "n = int(input())\nprint(n + 1)",
            },
        });
    });

    it("embeds try-it metadata on the requested sketch card when authoring asks for it", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                sectionRole: "module_project",
                practice: {
                    tryIt: true,
                    tryItExerciseId: "code-1",
                    tryItSketchIndex: 0,
                },
            } as any,
            draft: {
                title: "Read and add",
                summary: "Read input and add one.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch 1",
                        bodyMarkdown: "Body 1",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Try it",
                        prompt: "Read a number and print one more.",
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        tests: [
                            { stdin: "1\n", stdout: "2\n", match: "exact" },
                            { stdin: "4\n", stdout: "5\n", match: "exact" },
                        ],
                        hint: "Convert the input.",
                        help: {
                            concept: "Use int(input()) for number input.",
                            hint_1: "Read the number first.",
                            hint_2: "Print the new value.",
                        },
                    },
                ],
            } as any,
        });

        const sketchCard = bundle.cards.find((card) => card.id === "sketch0") as any;
        expect(sketchCard?.tryIt).toMatchObject({
            exerciseKey: "code-1",
            difficulty: "easy",
            preferKind: "code_input",
            required: true,
        });
        expect(sketchCard?.tryIt?.titleKey).toBe(
            "topics.python-for-beginners.python-1.read-and-add.tryIt.try_read_and_add_sketch0.title",
        );
        expect(sketchCard?.tryIt?.promptKey).toBe(
            "topics.python-for-beginners.python-1.read-and-add.tryIt.try_read_and_add_sketch0.prompt",
        );
        expect(sketchCard?.tryIt?.allowReveal).toBe(true);
    });

    it("emits sketch-card try-it metadata for normal Python lesson topics from profile.practice defaults", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                practice: {
                    tryIt: true,
                    tryItSketchIndex: 0,
                },
            } as any,
            draft: {
                title: "Read and add",
                summary: "Read input and add one.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch 1",
                        bodyMarkdown: "Body 1",
                    },
                ],
                quizDraft: [
                    {
                        id: "quiz-1",
                        kind: "single_choice",
                        title: "Quiz",
                        prompt: "Prompt",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Try it",
                        prompt: "Read a number and print one more.",
                        starterCode: "n = int(input())\n",
                        solutionCode: "n = int(input())\nprint(n + 1)\n",
                        tests: [
                            { stdin: "1\n", stdout: "2\n", match: "exact" },
                            { stdin: "4\n", stdout: "5\n", match: "exact" },
                        ],
                        hint: "Convert the input.",
                        help: {
                            concept: "Use int(input()) for number input.",
                            hint_1: "Read the number first.",
                            hint_2: "Print the new value.",
                        },
                    },
                ],
            } as any,
        });

        const sketchCard = bundle.cards.find((card) => card.id === "sketch0") as any;

        expect(sketchCard?.tryIt).toMatchObject({
            id: "try-read-and-add-sketch0",
            exerciseKey: "code-1",
            preferKind: "code_input",
            required: true,
            allowReveal: true,
        });
    });

    it("lets a practice-capable profile choose a different try-it exercise kind for normal topics", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "practice-single-choice",
            practice: {
                tryItDefault: {
                    enabled: true,
                    sketchIndex: 0,
                    allowReveal: true,
                },
                preferredTryItExerciseKind: "single_choice",
            },
            project: undefined,
        } satisfies CourseProfile);

        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                profileId: "practice-single-choice",
                practice: {
                    tryIt: true,
                    tryItSketchIndex: 0,
                },
            },
            draft: {
                title: "Read and add",
                summary: "Read input and add one.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch 1",
                        bodyMarkdown: "Body 1",
                    },
                ],
                quizDraft: [
                    {
                        id: "quiz-1",
                        kind: "single_choice",
                        title: "Quiz",
                        prompt: "Pick the right answer.",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                ],
            } as any,
        });

        const sketchCard = bundle.cards.find((card) => card.id === "sketch0") as any;

        expect(sketchCard?.tryIt).toMatchObject({
            exerciseKey: "quiz-1",
            preferKind: "single_choice",
        });
    });

    it("emits tryIt on every sketch for all_sketches placement and maps code_input exercises by index", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            draft: makeMultiSketchTryItDraft(),
        });

        expect(bundle.cards.find((card) => card.id === "sketch0")).toMatchObject({
            tryIt: { exerciseKey: "ex1" },
        });
        expect(bundle.cards.find((card) => card.id === "sketch1")).toMatchObject({
            tryIt: { exerciseKey: "ex6" },
        });
        expect(bundle.cards.find((card) => card.id === "sketch2")).toMatchObject({
            tryIt: { exerciseKey: "ex11" },
        });
    });

    it("does not reuse the last code_input when there are more sketches than exercises", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            draft: makeMultiSketchTryItDraft(4),
        });

        expect((bundle.cards.find((card) => card.id === "sketch3") as any)?.tryIt).toBeUndefined();
    });

    it("emits no tryIt when topic practice disables it", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                topicId: "attributes-and-init",
                practice: {
                    tryIt: false,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            draft: makeMultiSketchTryItDraft(),
        });

        expect(bundle.cards.every((card: any) => !card.tryIt)).toBe(true);
    });

    it("emits only the first sketch for first_sketch placement", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "first_sketch",
                },
            } as any,
            draft: makeMultiSketchTryItDraft(),
        });

        expect(bundle.cards.find((card) => card.id === "sketch0")).toMatchObject({
            tryIt: { exerciseKey: "ex1" },
        });
        expect((bundle.cards.find((card) => card.id === "sketch1") as any)?.tryIt).toBeUndefined();
        expect((bundle.cards.find((card) => card.id === "sketch2") as any)?.tryIt).toBeUndefined();
    });

    it("uses explicit tryItExerciseIds by sketch index", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                    tryItExerciseIds: ["ex6", "ex1", "ex11"],
                },
            } as any,
            draft: makeMultiSketchTryItDraft(),
        });

        expect(bundle.cards.find((card) => card.id === "sketch0")).toMatchObject({
            tryIt: { exerciseKey: "ex6" },
        });
        expect(bundle.cards.find((card) => card.id === "sketch1")).toMatchObject({
            tryIt: { exerciseKey: "ex1" },
        });
        expect(bundle.cards.find((card) => card.id === "sketch2")).toMatchObject({
            tryIt: { exerciseKey: "ex11" },
        });
    });

    it("keeps no local resolveTryItExerciseId helper in the emitters", async () => {
        const bundleSource = await readFile(
            new URL("../emit/buildTopicBundleFromDraft.ts", import.meta.url),
            "utf8",
        );
        const messageSource = await readFile(
            new URL("../emit/buildMessagesFromDraft.ts", import.meta.url),
            "utf8",
        );

        expect(bundleSource).not.toContain("function resolveTryItExerciseId(");
        expect(messageSource).not.toContain("function resolveTryItExerciseId(");
    });

    it("marks later project steps as carry-forward when project flow is progressive", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                practice: {
                    projectFlow: "progressive",
                },
            } as any,
            draft: {
                title: "Read and add",
                summary: "Read input and add one.",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Step 1",
                        starterCode: "print('one')\n",
                        solutionCode: "print('one')\n",
                        tests: [
                            { stdout: "one\n", match: "exact" },
                            { stdout: "one\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Step 2",
                        prompt: "Step 2",
                        starterCode: "print('two')\n",
                        solutionCode: "print('two')\n",
                        tests: [
                            { stdout: "two\n", match: "exact" },
                            { stdout: "two\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const projectCard = bundle.cards.find((card) => card.id === "project") as any;
        expect(projectCard?.project?.steps).toHaveLength(2);
        expect(projectCard?.project?.steps[0]?.carryFromPrev).toBeUndefined();
        expect(projectCard?.project?.steps[1]?.carryFromPrev).toBe(true);
    });

    it("uses the previous step solution as the progressive starter for Python module projects", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                sectionRole: "module_project",
                practice: {
                    projectFlow: "progressive",
                },
            } as any,
            draft: {
                title: "Module project",
                summary: "Build it step by step.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Create base app",
                        prompt: "Create the first working version.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('step 1 done')\n",
                        tests: [
                            { stdout: "step 1 done\n", match: "exact" },
                            { stdout: "step 1 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Add second feature",
                        prompt: "Add the second feature.",
                        starterCode: "print('fresh start')\n",
                        solutionCode: "print('step 2 done')\n",
                        tests: [
                            { stdout: "step 2 done\n", match: "exact" },
                            { stdout: "step 2 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const step2 = bundle.exercises.find((exercise) => exercise.id === "step-2") as any;
        expect(step2.starterCode).toContain("print('step 1 done')");
        expect(step2.starterCode).toContain("# Project step 2: Add second feature");
    });

    it("uses the profile capstone label in progressive step starters", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                moduleRole: "capstone",
                practice: {
                    projectFlow: "progressive",
                },
            } as any,
            draft: {
                title: "Capstone",
                summary: "Build the capstone.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Capstone step 1",
                        prompt: "Build the first version.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('capstone 1')\n",
                        tests: [
                            { stdout: "capstone 1\n", match: "exact" },
                            { stdout: "capstone 1\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Capstone step 2",
                        prompt: "Add the next capstone feature.",
                        starterCode: "print('fresh start')\n",
                        solutionCode: "print('capstone 2')\n",
                        tests: [
                            { stdout: "capstone 2\n", match: "exact" },
                            { stdout: "capstone 2\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const step2 = bundle.exercises.find((exercise) => exercise.id === "step-2") as any;
        expect(step2.starterCode).toContain("# Capstone step 2: Capstone step 2");
    });

    it("marks capstone projects in manifest metadata", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                moduleRole: "capstone",
            } as any,
            draft: {
                title: "Capstone",
                summary: "Final project",
                minutes: 30,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "capstone-step",
                        kind: "code_input",
                        title: "Build it",
                        prompt: "Build it",
                        starterCode: "print('done')\n",
                        solutionCode: "print('done')\n",
                        tests: [
                            { stdout: "done\n", match: "exact" },
                            { stdout: "done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const projectCard = bundle.cards.find((card) => card.id === "project") as any;
        expect(projectCard?.project?.displayKind).toBe("capstone");
        expect(projectCard?.project?.uiKind).toBe("capstone");
    });

    it("emits only project exercises and no quiz card for module_project topics", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                sectionRole: "module_project",
            } as any,
            draft: {
                title: "Module project",
                summary: "Build the module project.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "check-knowledge",
                        kind: "single_choice",
                        title: "Check knowledge",
                        prompt: "Which statement is true?",
                        hint: "Think about the project behavior.",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "build-step",
                        kind: "code_input",
                        title: "Build step",
                        prompt: "Build the next step.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done')\n",
                        tests: [
                            { stdout: "done\n", match: "exact" },
                            { stdout: "done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        expect(bundle.cards.some((card) => card.kind === "quiz")).toBe(false);
        expect(bundle.exercises).toHaveLength(1);
        expect(bundle.exercises[0]?.id).toBe("build-step");
    });

    it("emits only project exercises and no quiz card for capstone topics", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                moduleRole: "capstone",
            } as any,
            draft: {
                title: "Capstone",
                summary: "Build the capstone.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "check-knowledge",
                        kind: "single_choice",
                        title: "Check knowledge",
                        prompt: "Which statement is true?",
                        hint: "Think about the project behavior.",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "capstone-step",
                        kind: "code_input",
                        title: "Capstone step",
                        prompt: "Build the next step.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done')\n",
                        tests: [
                            { stdout: "done\n", match: "exact" },
                            { stdout: "done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        expect(bundle.cards.some((card) => card.kind === "quiz")).toBe(false);
        expect(bundle.exercises).toHaveLength(1);
        expect(bundle.exercises[0]?.id).toBe("capstone-step");
    });

    it("keeps quiz card emission for normal lesson topics", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: makePythonSeed(),
            draft: {
                title: "Lesson",
                summary: "Normal lesson.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "check-knowledge",
                        kind: "single_choice",
                        title: "Check knowledge",
                        prompt: "Which statement is true?",
                        hint: "Think about the project behavior.",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "build-step",
                        kind: "code_input",
                        title: "Build step",
                        prompt: "Build the next step.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done')\n",
                        tests: [
                            { stdout: "done\n", match: "exact" },
                            { stdout: "done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        expect(bundle.cards.some((card) => card.kind === "quiz")).toBe(true);
        expect(bundle.exercises).toHaveLength(2);
    });

    it("uses profile.project to select a different project exercise kind", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "project-single-choice",
            project: {
                getProjectConfig() {
                    return makeProjectConfig({
                        preferredProjectExerciseKind: "single_choice",
                    });
                },
                isProjectExercise(args) {
                    return args.exercise.kind === "single_choice";
                },
            },
        } satisfies CourseProfile);

        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                profileId: "project-single-choice",
                sectionRole: "module_project",
            } as any,
            draft: {
                title: "Project",
                summary: "Profile-selected project exercise kind.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "project-choice",
                        kind: "single_choice",
                        title: "Project choice",
                        prompt: "Choose the next project behavior.",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "non-project-code",
                        kind: "code_input",
                        title: "Code step",
                        prompt: "This should be filtered out.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done')\n",
                        tests: [
                            { stdout: "done\n", match: "exact" },
                            { stdout: "done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        expect(bundle.cards.some((card) => card.kind === "quiz")).toBe(false);
        expect(bundle.exercises).toHaveLength(1);
        expect(bundle.exercises[0]).toMatchObject({
            id: "project-choice",
            kind: "single_choice",
            purpose: "project",
        });
    });

    it("uses profile.project to choose try-it exercises", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "project-single-choice",
            project: {
                getProjectConfig(args) {
                    return {
                        ...(pythonProfile.project?.getProjectConfig(args) ?? makeProjectConfig()),
                        projectStepLabel: "Custom step",
                    };
                },
                isProjectExercise(args) {
                    return args.exercise.kind === "single_choice";
                },
            },
        } satisfies CourseProfile);

        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                profileId: "project-single-choice",
                sectionRole: "module_project",
                practice: {
                    tryIt: true,
                    tryItSketchIndex: 0,
                },
            } as any,
            draft: {
                title: "Project",
                summary: "Summary",
                minutes: 20,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch 1",
                        bodyMarkdown: "Body 1",
                    },
                ],
                quizDraft: [
                    {
                        id: "project-choice",
                        kind: "single_choice",
                        title: "Project choice",
                        prompt: "Choose the next behavior.",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["A", "B"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "non-project-code",
                        kind: "code_input",
                        title: "Code step",
                        prompt: "This should not drive try-it.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done')\n",
                        tests: [
                            { stdout: "done\n", match: "exact" },
                            { stdout: "done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const sketchCard = bundle.cards.find((card) => card.id === "sketch0") as any;
        expect(sketchCard?.tryIt?.exerciseKey).toBe("project-choice");
    });

    it("lets a fake profile change the progressive project step label", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "project-single-choice",
            project: {
                getProjectConfig(args) {
                    return {
                        ...(pythonProfile.project?.getProjectConfig(args) ?? makeProjectConfig()),
                        projectStepLabel: "Custom step",
                    };
                },
                isProjectExercise(args) {
                    return pythonProfile.project?.isProjectExercise(args) ?? false;
                },
            },
        } satisfies CourseProfile);

        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                profileId: "project-single-choice",
                sectionRole: "module_project",
                practice: {
                    projectFlow: "progressive",
                },
            } as any,
            draft: {
                title: "Project",
                summary: "Custom label project.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Build the first version.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done 1')\n",
                        tests: [
                            { stdout: "done 1\n", match: "exact" },
                            { stdout: "done 1\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Step 2",
                        prompt: "Build the second version.",
                        starterCode: "print('fresh')\n",
                        solutionCode: "print('done 2')\n",
                        tests: [
                            { stdout: "done 2\n", match: "exact" },
                            { stdout: "done 2\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const step2 = bundle.exercises.find((exercise) => exercise.id === "step-2") as any;
        expect(step2.starterCode).toContain("# Custom step 2: Step 2");
    });

    it("leaves non-progressive starters unchanged", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                sectionRole: "module_project",
                practice: {
                    projectFlow: "standalone",
                },
            } as any,
            draft: {
                title: "Module project",
                summary: "Standalone steps.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Build the first version.",
                        starterCode: "print('start')\n",
                        solutionCode: "print('done 1')\n",
                        tests: [
                            { stdout: "done 1\n", match: "exact" },
                            { stdout: "done 1\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Step 2",
                        prompt: "Build the second version.",
                        starterCode: "print('fresh start')\n",
                        solutionCode: "print('done 2')\n",
                        tests: [
                            { stdout: "done 2\n", match: "exact" },
                            { stdout: "done 2\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const step2 = bundle.exercises.find((exercise) => exercise.id === "step-2") as any;
        expect(step2.starterCode).toBe("print('fresh start')");
    });

    it("chains multi-file project workspaces forward for progressive project steps", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                sectionRole: "module_project",
                practice: {
                    projectFlow: "progressive",
                },
            } as any,
            draft: {
                title: "Operations project",
                summary: "Build a reusable file organizer.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Create helpers",
                        prompt: "Add the first helper module.",
                        starterCode: "from helpers import greet\nprint(greet())\n",
                        starterFiles: [
                            {
                                path: "main.py",
                                content: "from helpers import greet\nprint(greet())\n",
                                language: "python",
                                isEntry: true,
                            },
                            {
                                path: "helpers.py",
                                content: "def greet():\n    return 'draft'\n",
                                language: "python",
                            },
                        ],
                        solutionFiles: [
                            {
                                path: "main.py",
                                content: "from helpers import greet\nprint(greet())\n",
                                language: "python",
                                isEntry: true,
                            },
                            {
                                path: "helpers.py",
                                content: "def greet():\n    return 'step 1'\n",
                                language: "python",
                            },
                        ],
                        solutionCode: "from helpers import greet\nprint(greet())\n",
                        tests: [
                            { stdout: "step 1\n", match: "exact" },
                            { stdout: "step 1\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Add report writer",
                        prompt: "Add a report writer that uses the helper module.",
                        starterCode: "print('fresh start')\n",
                        starterFiles: [
                            {
                                path: "reports.py",
                                content: "def write_report():\n    return 'todo'\n",
                                language: "python",
                            },
                        ],
                        solutionCode:
                            "from helpers import greet\nfrom reports import write_report\nprint(greet(), write_report())\n",
                        tests: [
                            { stdout: "step 1 ready\n", match: "includes" },
                            { stdout: "report ready\n", match: "includes" },
                        ],
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                    },
                ],
            } as any,
        });

        const step2 = bundle.exercises.find((exercise) => exercise.id === "step-2") as any;
        expect(step2.starterFiles.map((file: any) => file.path)).toEqual([
            "main.py",
            "helpers.py",
            "reports.py",
        ]);
        expect(step2.solutionFiles.map((file: any) => file.path)).toEqual([
            "main.py",
            "helpers.py",
            "reports.py",
        ]);
    });

    it("preserves nested starter files and fixture files for online editor folders", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makePythonShapePack(),
            seed: {
                ...makePythonSeed(),
                workspacePolicy: {
                    workspace: {
                        capabilities: {
                            filesystem: { enabled: true },
                            createFiles: { enabled: true },
                            createFolders: { enabled: true },
                        },
                    },
                },
            } as any,
            draft: makeDraftWithExercise({
                id: "read-nested-file",
                kind: "code_input",
                title: "Read nested input",
                prompt: "Read data/input.txt and print its contents.",
                hint: "Use open('data/input.txt').",
                help: {
                    concept: "Relative paths can point into folders.",
                    hint_1: "Look in the data folder.",
                    hint_2: "Pass the relative path to open().",
                },
                starterCode: "# Write your answer below\n",
                entryFilePath: "src/main.py",
                starterFiles: [
                    {
                        path: "src/main.py",
                        content: "# Write your answer below\n",
                        language: "python",
                        isEntry: true,
                    },
                    {
                        path: "helpers/formatting.py",
                        content: "def clean(text):\n    return text.strip()\n",
                        language: "python",
                    },
                ],
                files: [
                    {
                        path: "data/input.txt",
                        content: "hello from a folder\n",
                        readOnly: true,
                    },
                ],
                solutionCode:
                    "from helpers.formatting import clean\nprint(clean(open('data/input.txt').read()))\n",
                recipeType: "fixed_tests",
                tests: [
                    {
                        stdout: "hello from a folder\n",
                        match: "exact",
                        files: [
                            {
                                path: "data/input.txt",
                                content: "hello from a folder\n",
                                readOnly: true,
                            },
                        ],
                    },
                    {
                        stdout: "hello from a folder\n",
                        match: "exact",
                        files: [
                            {
                                path: "data/input.txt",
                                content: "hello from a folder\n",
                                readOnly: true,
                            },
                        ],
                    },
                ],
            }),
        });

        const exercise = bundle.exercises.find(
            (item) => item.id === "read-nested-file",
        ) as any;

        expect(exercise.kind).toBe("code_input");
        expect(exercise.workspace.entryFilePath).toBe("src/main.py");

        expect(exercise.workspace.starterFiles).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "src/main.py",
                    content: expect.stringContaining("# Write your answer below"),
                    isEntry: true,
                }),
                expect.objectContaining({
                    path: "helpers/formatting.py",
                    content: expect.stringContaining("def clean"),
                }),
            ]),
        );

        expect(exercise.workspace.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "data/input.txt",
                    content: "hello from a folder\n",
                }),
            ]),
        );

        expect(JSON.stringify(exercise.recipe)).toContain("data/input.txt");
    });
    it("throws when programming code_input exercises omit explicit tests", () => {
        expect(() =>
            buildTopicBundleFromDraft({
                shape: makePythonShapePack(),
                seed: makePythonSeed(),

                draft: makeDraftWithExercise({
                    id: "code-1",
                    kind: "code_input",
                    title: "Read and add",
                    prompt: "Read a number and print the number plus one.",
                    starterCode: "n = int(input())\n# your code\n",
                    solutionCode: "n = int(input())\nprint(n + 1)\n",
                    hint: "Convert the input before adding.",
                    help: {
                        concept: "Use int(input()) for numeric input.",
                        hint_1: "Store the input in a variable.",
                        hint_2: "Print the final result.",
                    },
                }),
            }),
        )
            .toThrow(/needs at least one stdin\/stdout test case/i);    });
});
