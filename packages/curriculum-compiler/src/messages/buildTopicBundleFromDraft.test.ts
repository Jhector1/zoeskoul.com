import { describe, expect, it } from "vitest";
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
                tests: [{ stdin: "1\n", stdout: "2\n", match: "exact" }],
            }),
        });

        const exercise = bundle.exercises[0];
        expect(exercise?.kind).toBe("code_input");
        expect((exercise as any)?.runtime).toBeUndefined();
        expect((exercise as any)?.recipe?.type).toBe("fixed_tests");
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
                tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
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
                tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
                solutionCode: "n = int(input())\nprint(n + 1)",
            },
        });
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
            .toThrow(/needs either tests or semanticChecks/i);    });
});
