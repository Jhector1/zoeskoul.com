import { describe, expect, it } from "vitest";
import {
    assertTopicAuthoringDraft,
    validateTopicAuthoringDraft,
} from "./topic-authoring-draft.js";

function makeValidMinimalDraft() {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: [
            {
                id: "fill-1",
                kind: "fill_blank_choice" as const,
                title: "Fill blank",
                prompt: "Choose the right term.",
                hint: "Focus on the missing concept.",
                help: {
                    concept: "The blank needs the right term.",
                    hint_1: "Think about what the blank does.",
                    hint_2: "Choose the term that completes the statement.",
                },
                template: "A table uses a [blank1] to name a field.",
                choices: ["column", "row"],
                correctValue: "column",
            },
        ],
    };
}

describe("TopicAuthoringDraft canonical validation", () => {
    it("accepts a valid minimal draft", () => {
        const draft = makeValidMinimalDraft();
        expect(validateTopicAuthoringDraft(draft).ok).toBe(true);
        expect(() => assertTopicAuthoringDraft(draft)).not.toThrow();
    });

    it("rejects unknown top-level fields", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            extraTopLevelField: true,
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown field\(s\): extraTopLevelField/);
    });

    it("rejects unknown nested exercise fields", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    ...makeValidMinimalDraft().quizDraft[0],
                    unexpectedNestedField: true,
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown field\(s\): unexpectedNestedField/);
    });

    it("rejects unknown nested test fields", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
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
                    tests: [
                        {
                            stdout: "1\n",
                            unexpectedField: true,
                        },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown field\(s\): unexpectedField/);
    });

    it("rejects missing required fields", () => {
        const result = validateTopicAuthoringDraft({
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/title must be a non-empty string/);
    });

    it("rejects invalid code_input shape", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
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
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/code_input tests must be an array/);
    });
});
