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

describe("project and capstone synopsis pedagogy", () => {
    it("does not require a worked code example in a reading-only capstone synopsis", () => {
        const steps = Array.from({ length: 6 }, (_, index) => codeInput(`step-${index + 1}`));
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: {
                topicId: "final-neighborhood-resource-guide-history",
                sectionSlug: "git-foundations-section-4-final-capstone",
                sectionRole: "capstone",
                moduleRole: "capstone",
                projectBrief: {
                    scenario: "A neighborhood help desk needs a maintained resource guide.",
                    role: "Junior developer",
                    workspace: "One cumulative terminal workspace",
                    deliverable: "A six-step local Git history",
                    stepCountTarget: 6,
                },
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                    tryItPlacement: "all_sketches",
                },
            } as any,
            draft: {
                sketchBlocks: [
                    {
                        id: "intro",
                        title: "Project brief",
                        bodyMarkdown:
                            "A neighborhood help desk needs a carefully maintained resource guide and a reviewable handoff history.",
                    },
                ],
                quizDraft: steps,
                projectDraft: {
                    title: "Neighborhood Resource Guide History",
                    stepIds: steps.map((step) => step.id),
                },
            } as any,
        });

        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_WORKED_EXAMPLE_MISSING",
        );
        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_LINE_BY_LINE_EXPLANATION_MISSING",
        );
        expect(issues.map((issue) => issue.code)).not.toContain(
            "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
        );
    });

    it("still requires a worked example for an ordinary technical lesson", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: {
                topicId: "ordinary-technical-topic",
                sectionSlug: "ordinary-section",
                sectionRole: "lesson",
                moduleRole: "standard",
                practice: {
                    conceptualOnly: false,
                    requiresTryIt: true,
                    tryIt: true,
                    tryItPlacement: "first_sketch",
                },
            } as any,
            draft: {
                sketchBlocks: [
                    {
                        id: "intro",
                        title: "Technical lesson",
                        bodyMarkdown:
                            "This lesson explains the concept in abstract terms without showing the learner a concrete command walkthrough.",
                    },
                ],
                quizDraft: [codeInput("practice")],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "PROGRAMMING_WORKED_EXAMPLE_MISSING",
        );
    });
});
