import { describe, expect, it } from "vitest";
import { sanitizeHintLeaksInDraft } from "./sanitizeHintLeaksInDraft.js";

describe("sanitizeHintLeaksInDraft", () => {
    it("uses SQL workspace language for repaired code_input help", () => {
        const repaired = sanitizeHintLeaksInDraft(
            {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Query students",
                        prompt: "Write a query that lists student names.",
                        hint: "Use SELECT name FROM students to answer the question.",
                        help: {
                            concept: "SELECT name FROM students returns the result.",
                            hint_1: "Use the Python statement or expression that matches the required output.",
                            hint_2: "Run the script in the terminal.",
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

        const help = repaired.quizDraft[0].help;
        const combined = [repaired.quizDraft[0].hint, help.concept, help.hint_1, help.hint_2].join(" ");

        expect(combined).not.toMatch(/Python|program output|script|terminal|\.py/i);
        expect(combined).toMatch(/SQL editor|query|results table|Run query/i);
    });
});
