import { afterEach, describe, expect, it } from "vitest";
import {
    getCurriculumProfile,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile, ProjectProfileConfig,
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
                sectionRole: "module_project",
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
        ).toBe("Module Project");
        expect(
            capstoneMessages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.cards
                ?.project?.title,
        ).toBe("Final Capstone Project");
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
        ).toBe("Quiz");
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
            messages.topics?.["python-v2"]?.["python-v2-1"]?.["helper-modules"]?.quiz?.[
                "step-2"
            ]?.prompt,
        ).toContain("Continue the same module project from the previous working step.");
    });

    it("lets a fake profile choose a different try-it exercise kind", () => {
        const pythonProfile = getCurriculumProfile("python");
        registerCurriculumProfile({
            ...pythonProfile,
            id: "tryit-single-choice",
            project: {
                getProjectConfig(args) {
                    return pythonProfile.project?.getProjectConfig(args) ?? makeProjectConfig();
                },
                isProjectExercise(args) {
                    return args.exercise.kind === "single_choice";
                },
            },
        } satisfies CourseProfile);

        const messages = buildMessagesFromDraft({
            shape: makeShape(),
            seed: makeSeed({
                profileId: "tryit-single-choice",
                sectionRole: "module_project",
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

        const promptByExerciseId = Object.fromEntries(
            draft.quizDraft.map((exercise: any) => [exercise.id, `${exercise.prompt}.`]),
        );
        for (const sketchIndex of [0, 1, 2]) {
            const exerciseKey = bundle.cards.find((card: any) => card.id === `sketch${sketchIndex}`)?.tryIt?.exerciseKey;
            expect(
                messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt?.[
                    `try_attributes_and_init_sketch${sketchIndex}`
                ]?.prompt,
            ).toContain(promptByExerciseId[exerciseKey]);
            expect(
                messages.topics?.["python-v2"]?.["python-v2-1"]?.["attributes-and-init"]?.tryIt
                    ?.exercises?.[exerciseKey]?.title,
            ).toBe(draft.quizDraft.find((exercise: any) => exercise.id === exerciseKey)?.title);
        }
    });
});
