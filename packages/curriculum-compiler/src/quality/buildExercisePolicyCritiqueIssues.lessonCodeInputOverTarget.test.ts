import { describe, expect, it } from "vitest";
import { buildExercisePolicyCritiqueIssues } from "./buildExercisePolicyCritiqueIssues.js";

function codeExercise(id: string) {
    return {
        id,
        kind: "code_input",
        title: "Code",
        prompt: "Prompt",
        hint: "Hint",
        help: {
            concept: "Concept",
            hint_1: "H1",
            hint_2: "H2",
        },
        starterCode: "",
        solutionCode: "",
    };
}

function choiceExercise(id: string) {
    return {
        id,
        kind: "single_choice",
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

function plannedCounts(codeInput: number, singleChoice = 0) {
    return {
        total: codeInput + singleChoice,
        dominantKind: codeInput >= singleChoice ? "code_input" : "single_choice",
        counts: {
            single_choice: singleChoice,
            multi_choice: 0,
            drag_reorder: 0,
            fill_blank_choice: 0,
            text_input: 0,
            voice_input: 0,
            word_bank_arrange: 0,
            listen_build: 0,
            pseudocode_input: 0,
            code_input: codeInput,
        },
    } as any;
}

describe("lesson code_input planned-count semantics", () => {
    it("allows a lesson to exceed its planned code_input count with focused native Try Its", () => {
        const draft = {
            title: "Lesson",
            summary: "Summary",
            minutes: 20,
            quizDraft: [],
            sketchBlocks: [
                {
                    id: "sketch-1",
                    title: "Sketch",
                    bodyMarkdown: "Teaching.",
                    tryItExercises: Array.from({ length: 7 }, (_, index) =>
                        codeExercise(`try-${index + 1}`),
                    ),
                },
            ],
        } as any;

        const issues = buildExercisePolicyCritiqueIssues({
            draft,
            plannedCounts: plannedCounts(3),
            sectionRole: "lesson" as any,
        });

        expect(
            issues.some(
                (issue) =>
                    issue.code === "EXERCISE_POLICY_KIND_OVER_TARGET" &&
                    issue.message.includes('"code_input"'),
            ),
        ).toBe(false);
    });

    it("keeps project and capstone code_input over-target enforcement", () => {
        const draft = {
            title: "Project",
            summary: "Summary",
            minutes: 30,
            quizDraft: Array.from({ length: 7 }, (_, index) =>
                codeExercise(`project-step-${index + 1}`),
            ),
            sketchBlocks: [],
        } as any;

        for (const sectionRole of ["module_project", "capstone"] as const) {
            const issues = buildExercisePolicyCritiqueIssues({
                draft,
                plannedCounts: plannedCounts(3),
                sectionRole: sectionRole as any,
            });

            expect(
                issues.some(
                    (issue) =>
                        issue.code === "EXERCISE_POLICY_KIND_OVER_TARGET" &&
                        issue.message.includes('"code_input"'),
                ),
            ).toBe(true);
        }
    });

    it("does not relax over-target counts for non-code lesson exercise kinds", () => {
        const draft = {
            title: "Lesson",
            summary: "Summary",
            minutes: 20,
            quizDraft: [
                choiceExercise("q1"),
                choiceExercise("q2"),
                choiceExercise("q3"),
                choiceExercise("q4"),
            ],
            sketchBlocks: [],
        } as any;

        const issues = buildExercisePolicyCritiqueIssues({
            draft,
            plannedCounts: plannedCounts(0, 1),
            sectionRole: "lesson" as any,
        });

        expect(
            issues.some(
                (issue) =>
                    issue.code === "EXERCISE_POLICY_KIND_OVER_TARGET" &&
                    issue.message.includes('"single_choice"'),
            ),
        ).toBe(true);
    });
});
