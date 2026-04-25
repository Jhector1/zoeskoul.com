
import { describe, expect, it } from "vitest";
import { validateSqlPromptIntent } from "./validateSqlPromptIntent.js";

function makeCodeExercise(prompt: string, solutionCode: string) {
    return {
        id: "code-1",
        kind: "code_input",
        title: "Code",
        prompt,
        hint: "Hint",
        help: {
            concept: "Concept",
            hint_1: "H1",
            hint_2: "H2",
        },
        starterCode: "SELECT * FROM products;",
        solutionCode,
        recipeType: "sql_query",
        datasetId: "products_catalog",
    };
}

describe("validateSqlPromptIntent edge cases", () => {
    it("does not false-positive COUNT intent on account", () => {
        const result = validateSqlPromptIntent({
            seed: {} as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    makeCodeExercise(
                        "List each customer account with its status.",
                        "SELECT account_name, status FROM customers;",
                    ),
                ],
            } as any,
        });

        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_COUNT_MISSING")).toBe(false);
    });

    it("flags GROUP BY intent when prompt mentions grouping but SQL omits GROUP BY", () => {
        const result = validateSqlPromptIntent({
            seed: {} as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    makeCodeExercise(
                        "Group rows by category and show the results.",
                        "SELECT category FROM products;",
                    ),
                ],
            } as any,
        });

        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_GROUP_BY_MISSING")).toBe(true);
    });

    it("flags JOIN intent when prompt mentions combining tables but SQL omits JOIN", () => {
        const result = validateSqlPromptIntent({
            seed: {} as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    makeCodeExercise(
                        "Combine tables to show each order with its customer name.",
                        "SELECT order_id FROM orders;",
                    ),
                ],
            } as any,
        });

        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_JOIN_MISSING")).toBe(true);
    });



    it("does not false-positive COUNT on discount wording", () => {
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
                        title: "Discounted price",
                        prompt: "Calculate the discounted price for each product.",
                        hint: "Use subtraction.",
                        help: {
                            concept: "Use arithmetic in SELECT.",
                            hint_1: "Subtract one numeric column from another.",
                            hint_2: "Return the calculated value.",
                        },
                        starterCode: "",
                        solutionCode: "SELECT price - discount AS discounted_price FROM products;",
                        recipeType: "sql_query",
                        datasetId: "products",
                    },
                ],
            } as any,
        });

        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_COUNT_MISSING")).toBe(false);
    });

    it("flags real COUNT intent when prompt asks how many", () => {
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
                        title: "How many rows",
                        prompt: "How many orders are in the orders table?",
                        hint: "Use an aggregate.",
                        help: {
                            concept: "Use COUNT to count rows.",
                            hint_1: "Return one number.",
                            hint_2: "Use COUNT on a column or *.",
                        },
                        starterCode: "",
                        solutionCode: "SELECT * FROM orders;",
                        recipeType: "sql_query",
                        datasetId: "orders",
                    },
                ],
            } as any,
        });

        expect(result.issues.some((x) => x.code === "SQL_PROMPT_INTENT_COUNT_MISSING")).toBe(true);
    });
});