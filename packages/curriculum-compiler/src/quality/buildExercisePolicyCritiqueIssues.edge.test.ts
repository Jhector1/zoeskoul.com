
import { describe, expect, it } from "vitest";
import { buildExercisePolicyCritiqueIssues } from "./buildExercisePolicyCritiqueIssues.js";

function makeExercise(kind: string, id: string) {
    if (kind === "fill_blank_choice") {
        return {
            id,
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

    if (kind === "code_input") {
        return {
            id,
            kind,
            title: "Code",
            prompt: "Prompt",
            hint: "Hint",
            help: {
                concept: "Concept",
                hint_1: "H1",
                hint_2: "H2",
            },
            starterCode: "SELECT * FROM users;",
            solutionCode: "SELECT * FROM users;",
            recipeType: "sql_query",
            datasetId: "users_dataset",
        };
    }

    if (kind === "drag_reorder") {
        return {
            id,
            kind,
            title: "Drag",
            prompt: "Prompt",
            hint: "Hint",
            help: {
                concept: "Concept",
                hint_1: "H1",
                hint_2: "H2",
            },
            tokens: ["SELECT", "FROM"],
            correctOrder: ["SELECT", "FROM"],
        };
    }

    return {
        id,
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
}

describe("buildExercisePolicyCritiqueIssues edge cases", () => {
    it("reports total mismatch when actual total differs from planned total", () => {
        const issues = buildExercisePolicyCritiqueIssues({
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [makeExercise("single_choice", "q1")],
            } as any,
            plannedCounts: {
                total: 3,
                dominantKind: "single_choice",
                counts: {
                    single_choice: 1,
                    multi_choice: 1,
                    drag_reorder: 0,
                    fill_blank_choice: 1,
                    code_input: 0,
                },
            },
        } as any);

        expect(
            issues.some((issue) => issue.code === "EXERCISE_POLICY_TOTAL_MISMATCH"),
        ).toBe(true);
    });

    it("uses mix-based fallback when plannedCounts are absent", () => {
        const issues = buildExercisePolicyCritiqueIssues({
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    makeExercise("single_choice", "q1"),
                    makeExercise("single_choice", "q2"),
                    makeExercise("single_choice", "q3"),
                ],
            } as any,
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.1,
                    multi_choice: 0.1,
                    drag_reorder: 0.1,
                    fill_blank_choice: 0.5,
                    code_input: 0.2,
                },
            },
        } as any);

        expect(
            issues.some((issue) => issue.code === "EXERCISE_POLICY_DOMINANT_KIND_MISMATCH"),
        ).toBe(true);
    });
});