
import { describe, expect, it } from "vitest";
import { buildExercisePolicyCritiqueIssues } from "./buildExercisePolicyCritiqueIssues.js";

function makeDraft(kinds: string[]) {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: kinds.map((kind, index) => {
            if (kind === "fill_blank_choice") {
                return {
                    id: `q${index}`,
                    kind,
                    title: "Fill",
                    prompt: "Prompt",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "H1",
                        hint_2: "H2",
                    },
                    template: "A ___ B",
                    choices: ["X", "Y"],
                    correctValue: "X",
                };
            }

            return {
                id: `q${index}`,
                kind,
                title: "Choice",
                prompt: "Prompt",
                hint: "Hint",
                help: {
                    concept: "Concept",
                    hint_1: "H1",
                    hint_2: "H2",
                },
                options: ["A", "B"],
                correctOptionIds: ["a"],
            };
        }),
    };
}

describe("buildExercisePolicyCritiqueIssues", () => {
    it("uses planned counts when provided", () => {
        const issues = buildExercisePolicyCritiqueIssues({
            draft: makeDraft([
                "single_choice",
                "single_choice",
                "multi_choice",
                "code_input",
                "fill_blank_choice",
            ]) as any,
            plannedCounts: {
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
        } as any);

        expect(
            issues.some((issue) => issue.code === "EXERCISE_POLICY_KIND_UNDER_TARGET"),
        ).toBe(true);
        expect(
            issues.some((issue) => issue.code === "EXERCISE_POLICY_DOMINANT_KIND_MISMATCH"),
        ).toBe(true);
    });

    it("treats ties as acceptable when the planned dominant is part of the tie", () => {
        const issues = buildExercisePolicyCritiqueIssues({
            draft: makeDraft([
                "single_choice",
                "fill_blank_choice",
            ]) as any,
            plannedCounts: {
                total: 2,
                dominantKind: "fill_blank_choice",
                counts: {
                    single_choice: 1,
                    multi_choice: 0,
                    drag_reorder: 0,
                    fill_blank_choice: 1,
                    code_input: 0,
                },
            },
        } as any);

        expect(
            issues.some((issue) => issue.code === "EXERCISE_POLICY_DOMINANT_KIND_MISMATCH"),
        ).toBe(false);
    });
});