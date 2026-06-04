import { describe, expect, it } from "vitest";
import { buildMessagesFromDraft } from "./buildMessagesFromDraft.js";

function makeShape() {
    return {
        profileId: "python",
        subjectManifest: {
            keyPatterns: {
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
        topicId: "helper-modules",
        sectionRole: "lesson",
        moduleRole: "standard",
        practice: undefined,
        ...overrides,
    } as any;
}

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
        ).toEqual({
            title: "Try it yourself",
            prompt: "Create tools/names.py and import clean_name in main.py.",
        });
    });

    it("uses module project and capstone fallback card titles from authored structure", () => {
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
        ).toBe("Final Project");
    });
});
