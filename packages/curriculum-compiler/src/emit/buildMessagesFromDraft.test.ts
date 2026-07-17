import { afterEach, describe, expect, it } from "vitest";
import {
    getCurriculumProfile,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { buildMessagesFromDraft } from "./buildMessagesFromDraft.js";
import { buildTopicBundleFromDraft } from "./buildTopicBundleFromDraft.js";

function makeShape() {
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

function makeSeed(overrides: Record<string, unknown> = {}) {
    return {
        profileId: "python",
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        modulePrefix: "py1",
        moduleOrder: 1,
        sectionSlug: "python-v2-1-section-1",
        sectionOrder: 1,
        topicId: "helper-modules",
        order: 1,
        title: "Helper modules",
        summary: "Use helper modules.",
        minutes: 15,
        sectionRole: "lesson",
        moduleRole: "standard",
        sourceLocale: "en",
        targetLocales: [],
        moduleRuntimeDefaults: {
            kind: "code",
            language: "python",
        },
        practice: undefined,
        ...overrides,
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
                tests: [{ stdout: "ex1\n", match: "exact" }, { stdout: "ex1\n", match: "exact" }],
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
                tests: [{ stdout: "ex6\n", match: "exact" }, { stdout: "ex6\n", match: "exact" }],
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
                tests: [{ stdout: "ex11\n", match: "exact" }, { stdout: "ex11\n", match: "exact" }],
                hint: "Hint",
                help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
            },
        ],
    } as any;
}
afterEach(() => {
    unregisterCurriculumProfile("tryit-single-choice");
    unregisterCurriculumProfile("practice-messages-single-choice");
});

describe("buildMessagesFromDraft", () => {
    it("emits embedded try-it copy from the chosen code_input exercise", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                practice: {
                    tryIt: true,
                    tryItExerciseId: "code-1",
                    tryItSketchIndex: 0,
                },
            }),
            draft: {
                title: "Helper modules",
                summary: "Use helper modules.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        cardTitle: "Open the Helper Module",
                        title: "A helper module keeps reusable work separate",
                        bodyMarkdown: "Sketch body",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Build the helper",
                        prompt: "Create tools/names.py and import clean_name in main.py.",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.cards
                ?.sketch0?.title,
        ).toBe("Open the Helper Module");

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0,
        ).toMatchObject({
            title: "Try it yourself: Build the helper",
        });
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0?.prompt,
        ).toContain("Create tools/names.py and import clean_name in main.py.");
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.allowReveal,
        ).toBe(true);
    });

    it("emits embedded try-it copy for normal Python lesson topics from profile.practice defaults", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                practice: {
                    tryIt: true,
                    tryItSketchIndex: 0,
                },
            }),
            draft: {
                title: "Helper modules",
                summary: "Use helper modules.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch title",
                        bodyMarkdown: "Sketch body",
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
                        title: "Build the helper",
                        prompt: "Create tools/names.py and import clean_name in main.py.",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0,
        ).toMatchObject({
            title: "Try it yourself: Build the helper",
        });
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0?.prompt,
        ).toContain("Create tools/names.py and import clean_name in main.py.");
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.allowReveal,
        ).toBe(true);
    });

    it("lets a practice-capable profile choose a different try-it exercise kind in messages", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "practice-messages-single-choice",
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

        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                profileId: "practice-messages-single-choice",
                practice: {
                    tryIt: true,
                    tryItSketchIndex: 0,
                },
            }),
            draft: {
                title: "Helper modules",
                summary: "Use helper modules.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch title",
                        bodyMarkdown: "Sketch body",
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0,
        ).toMatchObject({
            title: "Try it yourself: Quiz",
        });
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0?.prompt,
        ).toContain("Pick the right answer.");
    });

    it("uses profile-driven module project and capstone card titles", () => {
        const moduleProjectMessages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                sectionRole: "module_project",
            }),
            draft: {
                title: "Project topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Prompt",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        const capstoneMessages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                moduleRole: "capstone",
            }),
            draft: {
                title: "Capstone topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Prompt",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        expect(
            moduleProjectMessages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.cards
                ?.project?.title,
        ).toBe("Real-World Module Project");
        expect(
            capstoneMessages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.cards
                ?.project?.title,
        ).toBe("Real-World Final Capstone");
    });

    it("does not emit quiz title for capstone topics", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                moduleRole: "capstone",
            }),
            draft: {
                title: "Capstone topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
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
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Prompt",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.cards
                ?.quiz?.title,
        ).toBeUndefined();
    });

    it("emits code_input instructions into messages when authored", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed(),
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "bash-1",
                        kind: "code_input",
                        title: "Use the terminal",
                        prompt: "Prompt text",
                        starterCode: "# start\n",
                        solutionCode: "pwd\n",
                        fixedLanguage: "bash",
                        recipeType: "shell_task",
                        instructions: "Run pwd in the terminal.",
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                ],
            } as any,
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.practice?.[
                "bash-1"
            ]?.instructions,
        ).toBe(
            "Run pwd in the terminal.",
        );
    });

    it("emits starter code and starter file content into messages", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed(),
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "read-nested-file",
                        kind: "code_input",
                        title: "Read nested file",
                        prompt: "Prompt text",
                        starterCode: "# Write your answer below\n",
                        starterFiles: [
                            {
                                path: "src/main.py",
                                content: "# Write your answer below\n",
                                isEntry: true,
                            },
                            {
                                path: "helpers/formatting.py",
                                content: "def clean(text):\n    return text.strip()\n",
                            },
                        ],
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                ],
            } as any,
        }) as any;

        const exerciseMessages = messages.topics?.["python-v2"]?.["python-v2-1"]?.[
            "helper-modules"
        ]?.practice?.["read-nested-file"];

        expect(exerciseMessages?.starterCode).toBe("# Write your answer below\n");
        expect(exerciseMessages?.starterFiles?.src_main_py?.content).toBe(
            "# Write your answer below\n",
        );
        expect(exerciseMessages?.starterFiles?.helpers_formatting_py?.content).toContain(
            "def clean",
        );
    });

    it("emits progressive project starter code into messages", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                sectionRole: "module_project",
                practice: {
                    projectFlow: "progressive",
                },
            }),
            draft: {
                title: "Project topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Create the first working version.",
                        starterCode: "# start\n",
                        solutionCode: "print('step 1 done')\n",
                        tests: [
                            { stdout: "step 1 done\n", match: "exact" },
                            { stdout: "step 1 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Step 2",
                        prompt: "Add the next feature.",
                        starterCode: "# fresh\n",
                        solutionCode: "print('step 2 done')\n",
                        tests: [
                            { stdout: "step 2 done\n", match: "exact" },
                            { stdout: "step 2 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                ],
            } as any,
        }) as any;

        const starterCode = messages.topics?.["python-v2"]?.["python-v2-1"]?.[
            "helper-modules"
        ]?.moduleProject?.steps?.step_2?.starterCode;

        expect(starterCode).toContain("print('step 1 done')");
        expect(starterCode).toContain("# Project step 2: Step 2");
    });

    it("uses the cumulative previous solution as the progressive starter for later project steps", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                sectionRole: "module_project",
                practice: {
                    projectFlow: "progressive",
                },
            }),
            draft: {
                title: "Project topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Create the first working version.",
                        starterCode: "# start\n",
                        solutionCode: "print('step 1 done')\n",
                        tests: [
                            { stdout: "step 1 done\n", match: "exact" },
                            { stdout: "step 1 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Step 2",
                        prompt: "Add the second feature.",
                        starterCode: "# fresh\n",
                        solutionCode: "print('step 2 done')\n",
                        tests: [
                            { stdout: "step 2 done\n", match: "exact" },
                            { stdout: "step 2 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                    {
                        id: "step-3",
                        kind: "code_input",
                        title: "Step 3",
                        prompt: "Add the final feature.",
                        starterCode: "# fresh\n",
                        solutionCode: "print('step 3 done')\n",
                        tests: [
                            { stdout: "step 3 done\n", match: "exact" },
                            { stdout: "step 3 done\n", match: "exact" },
                        ],
                        hint: "Hint",
                        help: { concept: "Concept", hint_1: "Hint 1", hint_2: "Hint 2" },
                    },
                ],
            } as any,
        }) as any;

        const starterCode = messages.topics?.["python-v2"]?.["python-v2-1"]?.[
            "helper-modules"
        ]?.moduleProject?.steps?.step_3?.starterCode;

        expect(starterCode).toContain("print('step 1 done')");
        expect(starterCode).toContain("print('step 2 done')");
        expect(starterCode).toContain("# Project step 3: Step 3");
    });

    it("keeps progressive SQL project solutions as one replacement query", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                profileId: "sql",
                sectionRole: "module_project",
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "sales_kpi",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                },
                practice: {
                    projectFlow: "progressive",
                },
            }),
            draft: {
                title: "Order value report",
                summary: "Build one cumulative SQL report.",
                minutes: 20,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Select order IDs",
                        prompt: "Select the order ID.",
                        starterCode: "SELECT -- add the column\nFROM sales_reporting;",
                        solutionCode: "SELECT order_id FROM sales_reporting;",
                        recipeType: "sql_query",
                        datasetId: "sales_kpi",
                        hint: "Select order_id.",
                        help: {
                            concept: "Start the report.",
                            hint_1: "Use SELECT.",
                            hint_2: "Read from sales_reporting.",
                        },
                    },
                    {
                        id: "step-2",
                        kind: "code_input",
                        title: "Add gross sales",
                        prompt: "Keep the order ID and add gross sales.",
                        starterCode: "SELECT -- keep the prior work\nFROM sales_reporting;",
                        solutionCode:
                            "SELECT order_id, quantity * unit_price AS gross_sales FROM sales_reporting;",
                        recipeType: "sql_query",
                        datasetId: "sales_kpi",
                        hint: "Multiply quantity by unit_price.",
                        help: {
                            concept: "Extend the same query.",
                            hint_1: "Keep order_id.",
                            hint_2: "Alias the expression.",
                        },
                    },
                    {
                        id: "step-3",
                        kind: "code_input",
                        title: "Round gross sales",
                        prompt: "Keep the report and round gross sales.",
                        starterCode: "SELECT -- keep the prior work\nFROM sales_reporting;",
                        solutionCode:
                            "SELECT order_id, ROUND(quantity * unit_price, 2) AS gross_sales FROM sales_reporting;",
                        recipeType: "sql_query",
                        datasetId: "sales_kpi",
                        hint: "Use ROUND.",
                        help: {
                            concept: "Finish the report.",
                            hint_1: "Keep order_id.",
                            hint_2: "Round to two places.",
                        },
                    },
                ],
            } as any,
        }) as any;

        const step2 = messages.topics?.["python-v2"]?.["python-v2-1"]?.[
            "helper-modules"
        ]?.moduleProject?.steps?.step_2;
        const step3 = messages.topics?.["python-v2"]?.["python-v2-1"]?.[
            "helper-modules"
        ]?.moduleProject?.steps?.step_3;

        expect(step2?.starterCode).toContain(
            "SELECT order_id FROM sales_reporting;",
        );
        expect(step2?.starterCode).toContain("-- Project step 2: Add gross sales");
        expect(step2?.starterCode).not.toContain("# Project step 2");
        expect(step2?.solutionCode).toBe(
            "SELECT order_id, quantity * unit_price AS gross_sales FROM sales_reporting;\n",
        );
        expect(step3?.solutionCode).toBe(
            "SELECT order_id, ROUND(quantity * unit_price, 2) AS gross_sales FROM sales_reporting;\n",
        );
        expect(step3?.solutionCode.match(/\bSELECT\b/gi)).toHaveLength(1);
    });

    it("still emits quiz title for normal lesson topics", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed(),
            draft: {
                title: "Lesson topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
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
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Prompt",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.cards
                ?.quiz?.title,
        ).toBe("Practice");
    });

    it("uses the profile continuePromptPrefix for progressive step 2 prompts", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                sectionRole: "module_project",
                practice: {
                    projectFlow: "progressive",
                },
            }),
            draft: {
                title: "Project topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        title: "Step 1",
                        prompt: "Create the first working version.",
                        starterCode: "# start\n",
                        solutionCode: "print('ok 1')\n",
                        tests: [
                            { stdout: "ok 1\n", match: "exact" },
                            { stdout: "ok 1\n", match: "exact" },
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
                        prompt: "Add the next feature.",
                        starterCode: "# fresh\n",
                        solutionCode: "print('ok 2')\n",
                        tests: [
                            { stdout: "ok 2\n", match: "exact" },
                            { stdout: "ok 2\n", match: "exact" },
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.moduleProject
                ?.steps?.step_2?.prompt,
        ).toContain("Continue the same module project from the previous working step.");
    });

    it("lets a fake profile choose a different try-it exercise kind", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "tryit-single-choice",
            practice: {
                ...pythonProfile.practice!,
                preferredTryItExerciseKind: "single_choice",
            },
            project: undefined,
        } satisfies CourseProfile);

        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                profileId: "tryit-single-choice",
                practice: {
                    tryIt: true,
                    tryItSketchIndex: 0,
                },
            }),
            draft: {
                title: "Project topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch title",
                        bodyMarkdown: "Sketch body",
                    },
                ],
                quizDraft: [
                    {
                        id: "choice-1",
                        kind: "single_choice",
                        title: "Choose a direction",
                        prompt: "Pick the next project behavior.",
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0,
        ).toMatchObject({
            title: "Try it yourself: Choose a direction",
        });
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt
                ?.try_helper_modules_sketch0?.prompt,
        ).toContain("Pick the next project behavior.");
    });

    it("leaves topics without tryIt unchanged", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed(),
            draft: {
                title: "Helper modules",
                summary: "Use helper modules.",
                minutes: 15,
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Sketch title",
                        bodyMarkdown: "Sketch body",
                    },
                ],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Build the helper",
                        prompt: "Create tools/names.py and import clean_name in main.py.",
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        tests: [
                            { stdout: "ok\n", match: "exact" },
                            { stdout: "ok\n", match: "exact" },
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
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.tryIt,
        ).toBeUndefined();
    });

    it("emits try-it messages for every sketch when placement is all_sketches", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            }),
            draft: makeMultiSketchTryItDraft(),
        }) as any;

        expect(messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt)
            .toMatchObject({
                try_attributes_and_init_sketch0: { title: "Try it yourself: Exercise 1" },
                try_attributes_and_init_sketch1: { title: "Try it yourself: Exercise 6" },
                try_attributes_and_init_sketch2: { title: "Try it yourself: Exercise 11" },
                allowReveal: true,
            });
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt
                ?.try_attributes_and_init_sketch0?.prompt,
        ).toContain("Prompt ex1.");
    });

    it("does not reuse a Try It exercise when there are more sketches than code_input exercises", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            }),
            draft: makeMultiSketchTryItDraft(4),
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt
                ?.try_attributes_and_init_sketch3,
        ).toBeUndefined();
    });

    it("emits no try-it messages when tryIt is false", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                topicId: "attributes-and-init",
                practice: {
                    tryIt: false,
                    tryItPlacement: "all_sketches",
                },
            }),
            draft: makeMultiSketchTryItDraft(),
        }) as any;

        expect(messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt)
            .toBeUndefined();
    });

    it("emits one try-it message for first_sketch placement", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "first_sketch",
                },
            }),
            draft: makeMultiSketchTryItDraft(),
        }) as any;

        const tryIt = messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt;
        expect(tryIt?.try_attributes_and_init_sketch0).toMatchObject({
            title: "Try it yourself: Exercise 1",
        });
        expect(tryIt?.try_attributes_and_init_sketch0?.prompt).toContain("Prompt ex1.");
        expect(tryIt?.try_attributes_and_init_sketch1).toBeUndefined();
        expect(tryIt?.try_attributes_and_init_sketch2).toBeUndefined();
    });

    it("uses explicit tryItExerciseIds in messages by sketch index", () => {
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                topicId: "attributes-and-init",
                practice: {
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                    tryItExerciseIds: ["ex6", "ex1", "ex11"],
                },
            }),
            draft: makeMultiSketchTryItDraft(),
        }) as any;

        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt,
        ).toMatchObject({
            try_attributes_and_init_sketch0: { title: "Try it yourself: Exercise 6" },
            try_attributes_and_init_sketch1: { title: "Try it yourself: Exercise 1" },
            try_attributes_and_init_sketch2: { title: "Try it yourself: Exercise 11" },
        });
        expect(
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt
                ?.try_attributes_and_init_sketch0?.prompt,
        ).toContain("Prompt ex6.");
    });

    it("keeps manifest and messages aligned on selected try-it exercises", () => {
        const seed = makeSeed({
            topicId: "attributes-and-init",
            practice: {
                tryIt: true,
                tryItPlacement: "all_sketches",
            },
        });
        const draft = makeMultiSketchTryItDraft();

        const bundle = buildTopicBundleFromDraft({
            shape: makeShape() as any,
            seed,
            draft,
        }) as any;
        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed,
            draft,
        }) as any;

        const selectedSourceExerciseIds = ["ex1", "ex6", "ex11"];
        for (const sketchIndex of [0, 1, 2]) {
            const exerciseKey = bundle.cards.find((card: any) => card.id === `sketch${sketchIndex}`)?.tryIt?.exerciseKey;
            const tryItMessageKey = `try_attributes_and_init_sketch${sketchIndex}`;
            const selectedSourceExercise = draft.quizDraft.find(
                (exercise: any) => exercise.id === selectedSourceExerciseIds[sketchIndex],
            );

            expect(exerciseKey).toBe(`try-attributes-and-init-sketch${sketchIndex}`);
            expect(
                messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt?.[
                    tryItMessageKey
                ]?.prompt,
            ).toContain(selectedSourceExercise?.prompt);
            expect(
                messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt?.[
                    tryItMessageKey
                ]?.title,
            ).toBe(`Try it yourself: ${selectedSourceExercise?.title}`);
        }
    });
});
