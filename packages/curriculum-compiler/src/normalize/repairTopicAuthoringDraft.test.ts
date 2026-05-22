
import { describe, expect, it } from "vitest";
import { repairTopicAuthoringDraft } from "./repairTopicAuthoringDraft.js";

describe("repairTopicAuthoringDraft", () => {
    it("canonicalizes fill_blank correctValue to an actual choice string", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "fill-1",
                    kind: "fill_blank_choice",
                    title: "Fill",
                    prompt: "Which term completes the statement?",
                    hint: "Think about filtering rows.",
                    help: {
                        concept: "Filtering uses a SQL clause.",
                        hint_1: "This clause comes before a condition.",
                        hint_2: "Choose the clause that filters rows.",
                    },
                    template: "SELECT * FROM users ___ age > 18",
                    choices: ["WHERE", "ORDER BY"],
                    correctValue: " where ",
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctValue).toBe("WHERE");
    });

    it("ensures multi_choice has at least one correctOptionIds fallback", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "multi-1",
                    kind: "multi_choice",
                    title: "Multi",
                    prompt: "Pick all valid SQL clauses.",
                    hint: "Think about SQL clauses.",
                    help: {
                        concept: "Some options are valid clauses.",
                        hint_1: "Pick one or more valid ones.",
                        hint_2: "Choose all that apply.",
                    },
                    options: ["SELECT", "BANANA"],
                    correctOptionIds: [],
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctOptionIds.length).toBeGreaterThanOrEqual(1);
    });

    it("replaces leaked choice hints with safe generic hint text", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    kind: "single_choice",
                    title: "Single",
                    prompt: "Pick the SQL clause used to filter rows.",
                    hint: "Use WHERE.",
                    help: {
                        concept: "The answer is WHERE.",
                        hint_1: "Think about WHERE.",
                        hint_2: "Choose WHERE.",
                    },
                    options: ["WHERE", "GROUP BY"],
                    correctOptionIds: ["a"],
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.hint).not.toMatch(/where/i);
        expect(exercise.help.concept).not.toMatch(/where/i);
    });

    it("uses SQL workspace language for default code_input help", () => {
        const repaired = repairTopicAuthoringDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Query",
                        prompt: "Write a query to list student names.",
                        hint: "",
                        help: {
                            concept: "",
                            hint_1: "",
                            hint_2: "",
                        },
                        starterCode: "SELECT * FROM students;",
                        solutionCode: "SELECT name FROM students;",
                        recipeType: "sql_query",
                        datasetId: "students_intro",
                    },
                ],
            } as any,
            {
                profileId: "sql",
                workspacePolicy: {
                    workspace: {
                        ui: {
                            editorLabel: "SQL editor",
                            runButtonLabel: "Run query",
                            resultsTableLabel: "results table",
                        },
                    },
                },
            } as any,
        );

        const exercise = repaired.quizDraft[0] as any;
        const combined = [
            exercise.hint,
            exercise.help.concept,
            exercise.help.hint_1,
            exercise.help.hint_2,
        ].join(" ");

        expect(combined).toContain("SQL editor");
        expect(combined).toContain("Run query");
        expect(combined).toContain("results table");
        expect(combined).not.toMatch(/Python|program output|script|terminal|\.py/i);
    });
});
