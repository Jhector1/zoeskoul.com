
import { describe, expect, it } from "vitest";
import { validateSqlPromptIntent } from "./validateSqlPromptIntent.js";

describe("validateSqlPromptIntent", () => {
    it("raises an error when strong count wording is present but SQL uses no COUNT", () => {
        const result = validateSqlPromptIntent({
            seed: {} as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "How many users are older than 18?",
                        hint: "Use filtering.",
                        help: {
                            concept: "You need an aggregate.",
                            hint_1: "Think about a counting aggregate.",
                            hint_2: "Return the number of matching rows.",
                        },
                        starterCode: "SELECT * FROM users;",
                        solutionCode: "SELECT name FROM users WHERE age > 18;",
                        recipeType: "sql_query",
                        datasetId: "users_dataset",
                    },
                ],
            } as any,
        });

        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_COUNT_MISSING")).toBe(true);
    });

    it("does not false-positive on words like discount", () => {
        const result = validateSqlPromptIntent({
            seed: {} as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "List products with a discount greater than 10.",
                        hint: "Use filtering.",
                        help: {
                            concept: "You need a filter.",
                            hint_1: "Compare the discount column.",
                            hint_2: "Return matching products.",
                        },
                        starterCode: "SELECT * FROM products;",
                        solutionCode: "SELECT * FROM products WHERE discount > 10;",
                        recipeType: "sql_query",
                        datasetId: "products_catalog",
                    },
                ],
            } as any,
        });

        // RED test against the old substring-based count detector.
        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_COUNT_MISSING")).toBe(false);
    });
});