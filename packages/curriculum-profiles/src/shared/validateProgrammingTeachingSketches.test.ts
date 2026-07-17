import { describe, expect, it } from "vitest";
import { validateProgrammingTeachingSketches } from "./validateProgrammingTeachingSketches.js";

const workedSketch = {
    id: "intro",
    title: "Intro",
    bodyMarkdown:
        "```python\nprint('hello')\nprint('world')\n```\nLine by line: first print hello, then print world.",
};

function codeInput(id: string) {
    return {
        id,
        kind: "code_input",
        title: `Exercise ${id}`,
        prompt: `Create the result for ${id}.`,
        hint: "Use the current concept.",
        help: {
            concept: "Concept",
            hint_1: "Hint 1",
            hint_2: "Hint 2",
        },
        starterCode: "print('start')\n",
        solutionCode: "print('done')\n",
        tests: [{ stdout: "done\n" }, { stdout: "done\n" }],
    } as any;
}

describe("validateProgrammingTeachingSketches", () => {
    it("does not require try-it coverage for conceptual-only topics", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: {
                practice: {
                    conceptualOnly: true,
                    requiresTryIt: false,
                    tryIt: false,
                },
            } as any,
            draft: {
                sketchBlocks: [
                    {
                        id: "intro",
                        title: "Intro",
                        bodyMarkdown: "Here is a worked example: read the prompt, then choose the best explanation.",
                    },
                ],
                quizDraft: [],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
        );
    });

    it("requires code_input try-it coverage for hands-on topics", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: {
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                    tryItPlacement: "first_sketch",
                },
            } as any,
            draft: {
                sketchBlocks: [workedSketch],
                quizDraft: [],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
        );
    });

    it("requires one code_input per sketch when shared policy uses all_sketches", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: {
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            draft: {
                sketchBlocks: [workedSketch, { ...workedSketch, id: "second", title: "Second" }],
                quizDraft: [codeInput("one")],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "PROGRAMMING_TRY_IT_PER_SKETCH_MISSING",
        );
    });
    it("rejects a Try It that copies the worked example", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "python",
            seed: {
                topicId: "printing",
                sectionSlug: "printing",
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            draft: {
                sketchBlocks: [workedSketch],
                quizDraft: [
                    {
                        ...codeInput("one"),
                        fixedLanguage: "python",
                        solutionCode: "print('hello')\nprint('world')\n",
                    },
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
        );
    });

});
