import { describe, expect, it } from "vitest";
import { validateProgrammingTeachingSketches } from "./validateProgrammingTeachingSketches.js";

function codeInput(id: string) {
    return {
        id,
        kind: "code_input",
        title: `Exercise ${id}`,
        prompt: `Create the result for ${id}.`,
        hint: "Use the current concept.",
        help: {
            concept: "Apply the current programming concept.",
            hint_1: "Use the worked example as a guide.",
            hint_2: "Make the focused code change requested.",
        },
        starterCode: "",
        solutionCode: `print("${id}")`,
        tests: [{ stdout: `${id}\n`, match: "exact" }],
    } as any;
}

function sketch(id: string, tryItExercises?: any[]) {
    return {
        id,
        title: `Sketch ${id}`,
        bodyMarkdown: [
            "Worked example:",
            "```python",
            'print("worked")',
            "```",
            "Line 1 prints the worked value.",
        ].join("\n"),
        ...(tryItExercises ? { tryItExercises } : {}),
    };
}

function seed(placement: "first_sketch" | "all_sketches") {
    return {
        practice: {
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: placement,
        },
    } as any;
}

describe("validateProgrammingTeachingSketches native sketch Try Its", () => {
    it("accepts a dedicated sketch code_input as hands-on Try It coverage", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: seed("first_sketch"),
            draft: {
                sketchBlocks: [sketch("s0", [codeInput("try-0")])],
                quizDraft: [],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
        );
    });

    it("accepts one or more dedicated Try Its on every sketch for all_sketches", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: seed("all_sketches"),
            draft: {
                sketchBlocks: [
                    sketch("s0", [codeInput("try-0a"), codeInput("try-0b")]),
                    sketch("s1", [codeInput("try-1")]),
                    sketch("s2", [
                        codeInput("try-2a"),
                        codeInput("try-2b"),
                        codeInput("try-2c"),
                    ]),
                ],
                quizDraft: [],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
        );
        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_PER_SKETCH_MISSING",
        );
    });

    it("does not let multiple native Try Its on one sketch hide a missing sketch", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: seed("all_sketches"),
            draft: {
                sketchBlocks: [
                    sketch("s0", [
                        codeInput("try-0a"),
                        codeInput("try-0b"),
                        codeInput("try-0c"),
                    ]),
                    sketch("s1"),
                    sketch("s2"),
                ],
                quizDraft: [],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "PROGRAMMING_TRY_IT_PER_SKETCH_MISSING",
        );
    });

    it("preserves legacy quizDraft code_input compatibility", () => {
        const issues = validateProgrammingTeachingSketches({
            profileId: "code-family",
            seed: seed("all_sketches"),
            draft: {
                sketchBlocks: [sketch("s0"), sketch("s1"), sketch("s2")],
                quizDraft: [
                    codeInput("legacy-0"),
                    codeInput("legacy-1"),
                    codeInput("legacy-2"),
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_COVERAGE_MISSING",
        );
        expect(issues.map((issue) => issue.code)).not.toContain(
            "PROGRAMMING_TRY_IT_PER_SKETCH_MISSING",
        );
    });
});
