import { describe, expect, it } from "vitest";
import { validateSqlDatasetConsistency } from "./validateSqlDatasetConsistency.js";

function makeSeed(overrides?: Partial<any>) {
    return {
        topicId: "adding-and-subtracting-in-sql",
        profileId: "sql",
        moduleRuntimeDefaults: {
            kind: "sql",
            datasetId: "orders",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        },
        moduleDataset: {
            id: "orders",
            tableSnapshots: {
                orders: {
                    columns: [
                        { name: "order_id" },
                        { name: "customer_id" },
                        { name: "subtotal" },
                        { name: "discount_amount" },
                        { name: "shipping_fee" },
                        { name: "total_amount" },
                    ],
                    rows: [],
                },
            },
        },
        ...overrides,
    } as any;
}

function makeDraft(overrides?: Partial<any>) {
    return {
        title: "Adding and Subtracting in SQL",
        summary: "Arithmetic with one dataset",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: [],
        ...overrides,
    } as any;
}

describe("validateSqlDatasetConsistency", () => {
    it("flags wrong sketch SQL table and columns under the current validator", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed(),
            draft: makeDraft({
                sketchBlocks: [
                    {
                        id: "sketch-1",
                        title: "Arithmetic example",
                        bodyMarkdown: [
                            "Use arithmetic in SQL:",
                            "",
                            "~~~sql",
                            "SELECT name, price - discount AS discounted_price",
                            "FROM products;",
                            "~~~",
                        ].join("\n"),
                    },
                ],
            }),
        });

        expect(issues).toContain(
            'Sketch sketch-1 references table "products" outside effective dataset "orders"',
        );
        expect(issues).toContain(
            'Sketch sketch-1 references column "name" that does not belong to effective dataset "orders"',
        );
        expect(issues).toContain(
            'Sketch sketch-1 references column "price" that does not belong to effective dataset "orders"',
        );
    });

    it("flags an unknown override dataset id when it cannot resolve an effective dataset", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed(),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Discounted total",
                        prompt: "Write a query.",
                        hint: "Use subtraction.",
                        help: {
                            concept: "Use arithmetic on numeric columns.",
                            hint_1: "Subtract one numeric column from another.",
                            hint_2: "Return a calculated value from the resolved dataset.",
                        },
                        starterCode:
                            "SELECT name, price - discount AS discounted_price FROM products;",
                        solutionCode:
                            "SELECT name, price - discount AS discounted_price FROM products;",
                        recipeType: "sql_query",
                        datasetId: "products",
                    },
                ],
            }),
        });

        expect(issues).toContain(
            "Exercise code-1 could not resolve an effective dataset",
        );
    });

    it("flags wrong starterCode and solutionCode references under the current validator", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed(),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Discounted total",
                        prompt: "Write a query.",
                        hint: "Use subtraction.",
                        help: {
                            concept: "Use arithmetic on numeric columns.",
                            hint_1: "Subtract one numeric column from another.",
                            hint_2: "Return a calculated value.",
                        },
                        starterCode:
                            "SELECT name, price - discount AS discounted_price FROM products;",
                        solutionCode:
                            "SELECT order_id, subtotal - discount AS discounted_total FROM orders;",
                        recipeType: "sql_query",
                        datasetId: "orders",
                    },
                ],
            }),
        });

        expect(issues).toContain(
            'Exercise code-1 references table "products" outside effective dataset "orders"',
        );
        expect(issues).toContain(
            'Exercise code-1 references column "name" that does not belong to effective dataset "orders"',
        );
        expect(issues).toContain(
            'Exercise code-1 references column "price" that does not belong to effective dataset "orders"',
        );
    });

    it("does not currently validate unsupported SQL recipe types", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed(),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Bad recipe type",
                        prompt: "Write a query.",
                        hint: "Use SQL.",
                        help: {
                            concept: "Use SQL.",
                            hint_1: "Write a query.",
                            hint_2: "Return valid SQL.",
                        },
                        starterCode: "SELECT * FROM orders;",
                        solutionCode: "SELECT * FROM orders;",
                        recipeType: "fixed_tests",
                        datasetId: "orders",
                    },
                ],
            }),
        });

        expect(issues).toEqual([]);
    });

    it("does not currently emit a missing-dataset error in this fallback scenario", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed({
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: undefined,
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                },
            }),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Missing dataset",
                        prompt: "Write a query.",
                        hint: "Use SQL.",
                        help: {
                            concept: "Use SQL.",
                            hint_1: "Write a query.",
                            hint_2: "Return valid SQL.",
                        },
                        starterCode: "SELECT * FROM orders;",
                        solutionCode: "SELECT * FROM orders;",
                        recipeType: "sql_query",
                        datasetId: undefined,
                    },
                ],
            }),
        });

        expect(issues).toEqual([]);
    });

    it("passes when a sql_query exercise resolves its dataset from module defaults", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed(),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Resolved from module",
                        prompt: "Write a query.",
                        hint: "Use SQL.",
                        help: {
                            concept: "Use SQL.",
                            hint_1: "Write a query.",
                            hint_2: "Return valid SQL.",
                        },
                        starterCode: "SELECT * FROM orders;",
                        solutionCode: "SELECT * FROM orders;",
                        recipeType: "sql_query",
                        datasetId: undefined,
                    },
                ],
            }),
        });

        expect(issues).toEqual([]);
    });

    it("flags CREATE TABLE against a table that already exists in the effective dataset", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed({
                moduleDataset: {
                    id: "products_catalog",
                    schemaSql: `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
                    `.trim(),
                    tableSnapshots: {},
                },
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "products_catalog",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                },
            }),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Create products again",
                        prompt: "Write a query.",
                        hint: "Use SQL.",
                        help: {
                            concept: "Use SQL.",
                            hint_1: "Write a query.",
                            hint_2: "Return valid SQL.",
                        },
                        starterCode: "CREATE TABLE products (id INTEGER PRIMARY KEY);",
                        solutionCode: "CREATE TABLE products (id INTEGER PRIMARY KEY);",
                        recipeType: "sql_query",
                        datasetId: "products_catalog",
                    },
                ],
            }),
        });

        expect(issues).toContain(
            'Exercise code-1 creates table "products" even though it already exists in effective dataset "products_catalog"',
        );
    });

    it("allows CREATE TABLE when the table name is not already present in the effective dataset", () => {
        const issues = validateSqlDatasetConsistency({
            seed: makeSeed({
                moduleDataset: {
                    id: "products_catalog",
                    schemaSql: `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
                    `.trim(),
                    tableSnapshots: {},
                },
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "products_catalog",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                },
            }),
            draft: makeDraft({
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Create suppliers",
                        prompt: "Write a query.",
                        hint: "Use SQL.",
                        help: {
                            concept: "Use SQL.",
                            hint_1: "Write a query.",
                            hint_2: "Return valid SQL.",
                        },
                        starterCode:
                            "CREATE TABLE suppliers (supplier_id INTEGER PRIMARY KEY);",
                        solutionCode:
                            "CREATE TABLE suppliers (supplier_id INTEGER PRIMARY KEY);",
                        recipeType: "sql_query",
                        datasetId: "products_catalog",
                    },
                ],
            }),
        });

        expect(issues).toEqual([]);
    });
});
