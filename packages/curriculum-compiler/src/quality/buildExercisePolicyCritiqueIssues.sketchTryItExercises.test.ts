import { describe, expect, it } from "vitest";
import { buildExercisePolicyCritiqueIssues } from "./buildExercisePolicyCritiqueIssues.js";

describe("buildExercisePolicyCritiqueIssues dedicated sketch Try Its", () => {
    it("counts sketch tryItExercises in planned exercise counts", () => {
        const quizDraft = Array.from({ length: 6 }, (_, index) => ({
            id: `quiz-${index + 1}`,
            kind: "single_choice",
        }));

        const tryItExercises = Array.from({ length: 7 }, (_, index) => ({
            id: `try-${index + 1}`,
            kind: "code_input",
        }));

        const draft = {
            quizDraft,
            sketchBlocks: [
                {
                    id: "sketch0",
                    title: "Sketch",
                    bodyMarkdown: "Teaching body.",
                    tryItExercises,
                },
            ],
        } as any;

        const issues = buildExercisePolicyCritiqueIssues({
            draft,
            plannedCounts: {
                total: 13,
                dominantKind: "code_input",
                counts: {
                    single_choice: 6,
                    multi_choice: 0,
                    drag_reorder: 0,
                    fill_blank_choice: 0,
                    short_answer: 0,
                    matching: 0,
                    pseudocode_input: 0,
                    code_input: 7,
                },
            } as any,
            sectionRole: "lesson" as any,
        });

        expect(
            issues.some(
                (issue) =>
                    issue.code === "EXERCISE_POLICY_CODE_INPUT_UNDER_TARGET" ||
                    issue.code === "EXERCISE_POLICY_TOTAL_MISMATCH" ||
                    issue.code === "EXERCISE_POLICY_DOMINANT_KIND_MISMATCH",
            ),
        ).toBe(false);
    });
});
