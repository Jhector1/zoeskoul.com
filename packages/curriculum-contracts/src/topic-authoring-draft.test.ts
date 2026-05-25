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

    it("accepts code_input fixture files", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Read a file",
                    prompt: "Read names.txt and print the first line.",
                    hint: "Use the provided file.",
                    help: {
                        concept: "File I/O exercises can include provided fixture files.",
                        hint_1: "Open the provided file path exactly as written.",
                        hint_2: "Print the requested value.",
                    },
                    starterCode: "# start\n",
                    solutionCode: "with open('names.txt') as f:\n    print(f.readline().strip())\n",
                    recipeType: "fixed_tests" as const,
                    tests: [
                        {
                            stdout: "Ada\n",
                        },
                    ],
                    files: [
                        {
                            path: "names.txt",
                            content: "Ada\nGrace\n",
                            readOnly: true,
                        },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("accepts per-test file fixtures for code_input", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Read different files",
                    prompt: "Read message.txt and print its contents.",
                    hint: "Use the provided file fixture for each test.",
                    help: {
                        concept: "File I/O fixed tests can vary file contents per test.",
                        hint_1: "Use the same file path each time.",
                        hint_2: "Match the expected output to the matching test fixture.",
                    },
                    starterCode: "# start\n",
                    solutionCode: "with open('message.txt') as f:\n    print(f.read(), end='')\n",
                    recipeType: "fixed_tests" as const,
                    tests: [
                        {
                            stdout: "Hello\n",
                            files: [
                                {
                                    path: "message.txt",
                                    content: "Hello\n",
                                    readOnly: true,
                                },
                            ],
                        },
                        {
                            stdout: "Bye\n",
                            files: [
                                {
                                    path: "message.txt",
                                    content: "Bye\n",
                                    readOnly: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(true);
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

    it("rejects variant-specific fields that do not match the declared kind", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    ...makeValidMinimalDraft().quizDraft[0],
                    kind: "single_choice" as const,
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toMatch(
            /unknown field\(s\): template, choices, correctValue/,
        );
    });
});
