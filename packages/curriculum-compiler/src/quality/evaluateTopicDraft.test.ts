import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildExercisePolicyCritiqueIssuesMock } = vi.hoisted(() => {
    return {
        buildExercisePolicyCritiqueIssuesMock: vi.fn(() => []),
    };
});

vi.mock("../normalize/repairIncompleteExercises.js", () => ({
    repairIncompleteExercises: vi.fn(async ({ draft }) => draft),
}));

vi.mock("../normalize/repairTopicAuthoringDraft.js", () => ({
    repairTopicAuthoringDraft: vi.fn((draft) => draft),
}));

vi.mock("../validate/validateExerciseHints.js", () => ({
    validateExerciseHints: vi.fn(() => []),
}));

vi.mock("./buildHintCritiqueIssues.js", () => ({
    buildHintCritiqueIssues: vi.fn(() => []),
}));

vi.mock("./buildExercisePolicyCritiqueIssues.js", () => ({
    buildExercisePolicyCritiqueIssues: buildExercisePolicyCritiqueIssuesMock,
}));

import { evaluateTopicDraft } from "./evaluateTopicDraft.js";

describe("evaluateTopicDraft", () => {
    beforeEach(() => {
        buildExercisePolicyCritiqueIssuesMock.mockClear();
    });
    it("re-sanitizes leaked hints after profile repair before validation", async () => {
        const result = await evaluateTopicDraft({
            provider: {} as any,
            seed: {
                topicId: "the-where-clause",
                exercisePolicy: undefined,
                plannedExerciseCounts: undefined,
            } as any,
            rawDraft: {
                title: "The WHERE clause",
                summary: "Filtering rows",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "multichoice-where-conditions",
                        kind: "multi_choice",
                        title: "WHERE conditions",
                        prompt: "Select all expressions that can be used as WHERE conditions.",
                        hint: "Safe hint.",
                        help: {
                            concept: "Safe concept.",
                            hint_1: "Safe hint 1.",
                            hint_2: "Safe hint 2.",
                        },
                        options: [
                            "price > 10",
                            "name = 'Pen'",
                            "ORDER BY price",
                            "GROUP BY category",
                        ],
                        correctOptionIds: ["a", "b"],
                    },
                ],
            } as any,
            profileServices: {
                repairDraft: async ({ draft }: any) => ({
                    draft: {
                        ...draft,
                        quizDraft: [
                            {
                                ...draft.quizDraft[0],
                                hint: "Choose price > 10 and name = 'Pen'.",
                                help: {
                                    concept: "The answer uses price > 10 and name = 'Pen'.",
                                    hint_1: "Pick price > 10 and name = 'Pen'.",
                                    hint_2: "Do not choose ORDER BY price or GROUP BY category.",
                                },
                            },
                        ],
                    },
                    report: { topicId: "the-where-clause", repairs: [] },
                }),
                critiqueDraft: async () => ({
                    ok: true,
                    topicId: "the-where-clause",
                    issues: [],
                }),
                validateSemantic: async () => ({
                    ok: true,
                    topicId: "the-where-clause",
                    issues: [],
                }),
            } as any,
        });

        expect(result.hintWarnings).toEqual([]);
    });

    it("re-sanitizes leaked fill_blank hints after profile repair before validation", async () => {
        const result = await evaluateTopicDraft({
            provider: {} as any,
            seed: {
                topicId: "or-2",
                exercisePolicy: undefined,
                plannedExerciseCounts: undefined,
            } as any,
            rawDraft: {
                title: "OR",
                summary: "Filtering with multiple conditions",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "fill-blank-2",
                        kind: "fill_blank_choice",
                        title: "OR keyword",
                        prompt: "Complete the SQL statement with the missing logical operator.",
                        hint: "Safe hint.",
                        help: {
                            concept: "Safe concept.",
                            hint_1: "Safe hint 1.",
                            hint_2: "Safe hint 2.",
                        },
                        template: "SELECT * FROM products WHERE price < 10 ___ stock > 0",
                        choices: ["OR", "AND"],
                        correctValue: "OR",
                    },
                ],
            } as any,
            profileServices: {
                repairDraft: async ({ draft }: any) => ({
                    draft: {
                        ...draft,
                        quizDraft: [
                            {
                                ...draft.quizDraft[0],
                                hint: "Use OR here.",
                                help: {
                                    concept: "The missing term is OR.",
                                    hint_1: "Choose OR.",
                                    hint_2: "Use the OR operator.",
                                },
                            },
                        ],
                    },
                    report: { topicId: "or-2", repairs: [] },
                }),
                critiqueDraft: async () => ({
                    ok: true,
                    topicId: "or-2",
                    issues: [],
                }),
                validateSemantic: async () => ({
                    ok: true,
                    topicId: "or-2",
                    issues: [],
                }),
            } as any,
        });

        expect(result.hintWarnings).toEqual([]);
    });
    it("passes plannedExerciseCounts into policy critique", async () => {
        const seed = {
            topicId: "topic-1",
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
        };

        await evaluateTopicDraft({
            provider: {} as any,
            seed: seed as any,
            rawDraft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [],
            } as any,
            profileServices: {
                repairDraft: vi.fn(async ({ draft }) => ({
                    draft,
                    report: { topicId: "topic-1", repairs: [] },
                })),
                critiqueDraft: vi.fn(async () => ({
                    ok: true,
                    topicId: "topic-1",
                    issues: [],
                })),
                validateSemantic: vi.fn(async () => ({
                    ok: true,
                    topicId: "topic-1",
                    issues: [],
                })),
            } as any,
        });

        expect(buildExercisePolicyCritiqueIssuesMock).toHaveBeenCalledWith(
            expect.objectContaining({
                plannedCounts: seed.plannedExerciseCounts,
            }),
        );
    });
});