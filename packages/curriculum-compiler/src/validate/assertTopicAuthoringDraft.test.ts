import { describe, expect, it } from "vitest";
import {
    assertTopicAuthoringDraft,
    validateTopicAuthoringDraft,
} from "./assertTopicAuthoringDraft.js";

function makeValidDraft() {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        sketchBlocks: [
            {
                id: "sketch-1",
                title: "Sketch",
                bodyMarkdown: "Body",
            },
        ],
        quizDraft: [
            {
                id: "fillblank-1",
                kind: "fill_blank_choice" as const,
                title: "Fill blank",
                prompt: "Choose the right SQL term.",
                hint: "Focus on the missing concept.",
                help: {
                    concept: "The blank needs a SQL term.",
                    hint_1: "Think about what the blank does.",
                    hint_2: "Choose the term that completes the statement.",
                },
                template: "SELECT * FROM users WHERE age ___ 18",
                choices: [">", "<", "="],
                correctValue: ">",
            },
        ],
    };
}

describe("assertTopicAuthoringDraft", () => {
    it("accepts a valid fill_blank_choice when correctValue is included in choices", () => {
        const draft = makeValidDraft();
        expect(() => assertTopicAuthoringDraft(draft as any)).not.toThrow();
    });
    it("does not count Python dunder method names as fill blanks", () => {
        const draft = makeValidDraft();

        draft.quizDraft[0] = {
            id: "fillblank-dunder",
            kind: "fill_blank_choice" as const,
            title: "Initialize an attribute",
            prompt: "Complete the __init__ method by choosing the missing attribute name.",
            hint: "The blank is the instance attribute after self.",
            help: {
                concept: "The __init__ method initializes instance attributes.",
                hint_1: "Look after self.",
                hint_2: "Choose the attribute name.",
            },
            template: "class Person:\n    def __init__(self, name):\n        self.[blank1] = name",
            choices: ["name", "age"],
            correctValue: "name",
        };

        expect(() => assertTopicAuthoringDraft(draft as any)).not.toThrow();
    });
    it("rejects fill_blank_choice when correctValue is missing", () => {
        const draft = makeValidDraft();
        draft.quizDraft[0].correctValue = "";

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /fill_blank_choice needs correctValue/,
        );
    });

    it("rejects fill_blank_choice when correctValue is not included in choices", () => {
        const draft = makeValidDraft();
        draft.quizDraft[0].correctValue = ">=";

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /correctValue must be included in choices/,
        );
    });

    it("rejects multi_choice with no correctOptionIds", () => {
        const draft = {
            ...makeValidDraft(),
            quizDraft: [
                {
                    id: "multi-1",
                    kind: "multi_choice" as const,
                    title: "Multi",
                    prompt: "Pick all valid clauses.",
                    hint: "Think about SQL clauses.",
                    help: {
                        concept: "Some clauses are valid in SQL.",
                        hint_1: "Pick one or more valid options.",
                        hint_2: "Choose all that apply.",
                    },
                    options: ["SELECT", "BANANA"],
                    correctOptionIds: [],
                },
            ],
        };

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /multi_choice needs at least 1 correctOptionIds entry/,
        );
    });

    it("rejects unknown extra top-level fields", () => {
        const draft = {
            ...makeValidDraft(),
            extraField: "nope",
        };

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /unknown field\(s\): extraField/,
        );
    });

    it("rejects unknown nested exercise fields", () => {
        const draft = {
            ...makeValidDraft(),
            quizDraft: [
                {
                    ...makeValidDraft().quizDraft[0],
                    unexpectedNestedField: true,
                },
            ],
        };

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /unknown field\(s\): unexpectedNestedField/,
        );
    });

    it("rejects code_input with an invalid shape before compilation", () => {
        const draft = {
            ...makeValidDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Code",
                    prompt: "Prompt",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    starterCode: "# start\n",
                    solutionCode: "print(1)\n",
                    recipeType: "fixed_tests" as const,
                    tests: "not-an-array",
                },
            ],
        };

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /code_input tests must be an array/,
        );
    });

    it("rejects exercises with an unknown kind", () => {
        const result = validateTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "oops",
                    kind: "wrong_kind",
                    title: "Wrong",
                    prompt: "Prompt",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown kind/);
    });
});
