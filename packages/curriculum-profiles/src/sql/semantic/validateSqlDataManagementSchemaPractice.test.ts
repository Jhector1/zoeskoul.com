import { describe, expect, it } from "vitest";
import { validateSqlDataManagementSchemaPractice } from "./validateSqlDataManagementSchemaPractice.js";

function seed(overrides: Record<string, unknown> = {}) {
    return {
        courseSlug: "sql-data-management",
        moduleNumber: 2,
        moduleOrder: 3,
        topicId: "create-products",
        ...overrides,
    } as any;
}

function draft(args: {
    starterSchema: string;
    solutionSchema: string;
    starterQuery?: string;
    solutionQuery?: string;
    entryFilePath?: string;
}) {
    return {
        title: "Create Products",
        summary: "Create and inspect a table.",
        minutes: 20,
        sketchBlocks: [],
        quizDraft: [{
            id: "create-products",
            kind: "code_input",
            title: "Create Products",
            prompt: "Create products in schema.sql and inspect it in query.sql.",
            hint: "Create, then inspect.",
            help: {
                concept: "Schema and inspection are separate.",
                hint_1: "Use CREATE TABLE.",
                hint_2: "Use sqlite_master.",
            },
            recipeType: "sql_query",
            datasetId: "ddl_blank",
            entryFilePath: args.entryFilePath ?? "schema.sql",
            starterCode: args.starterSchema,
            solutionCode: args.solutionSchema,
            starterFiles: [
                { path: "schema.sql", content: args.starterSchema },
                { path: "query.sql", content: args.starterQuery ?? "-- Inspect products here.\n" },
            ],
            solutionFiles: [
                { path: "schema.sql", content: args.solutionSchema },
                { path: "query.sql", content: args.solutionQuery ?? "SELECT sql FROM sqlite_master WHERE name = 'products';" },
            ],
            sqlFileOrder: ["schema.sql", "query.sql"],
            checkSql: "SELECT sql FROM sqlite_master WHERE name = 'products';",
        }],
    } as any;
}

describe("validateSqlDataManagementSchemaPractice", () => {
    it("rejects a completed schema starter", () => {
        const schema = "CREATE TABLE products (id INTEGER PRIMARY KEY);";
        const issues = validateSqlDataManagementSchemaPractice({
            seed: seed(),
            draft: draft({ starterSchema: schema, solutionSchema: schema }),
        });
        expect(issues.map((entry) => entry.code))
            .toContain("SQL_SCHEMA_STARTER_ALREADY_SOLVED");
    });

    it("accepts unfinished schema and query starters", () => {
        const issues = validateSqlDataManagementSchemaPractice({
            seed: seed(),
            draft: draft({
                starterSchema: "-- Create products here.\n",
                solutionSchema: "CREATE TABLE products (id INTEGER PRIMARY KEY);",
                starterQuery: "-- Inspect products here.\n",
                solutionQuery: "SELECT sql FROM sqlite_master WHERE name = 'products';",
            }),
        });
        expect(issues).toEqual([]);
    });

    it("allows provided parent tables when the child remains learner work", () => {
        const issues = validateSqlDataManagementSchemaPractice({
            seed: seed({ topicId: "foreign-keys" }),
            draft: draft({
                starterSchema: [
                    "CREATE TABLE employees (id INTEGER PRIMARY KEY);",
                    "-- Create departments below.",
                ].join("\n"),
                solutionSchema: [
                    "CREATE TABLE employees (id INTEGER PRIMARY KEY);",
                    "CREATE TABLE departments (",
                    "  id INTEGER PRIMARY KEY,",
                    "  manager_id INTEGER,",
                    "  FOREIGN KEY (manager_id) REFERENCES employees(id)",
                    ");",
                ].join("\n"),
                starterQuery: "-- Inspect the relationship.\n",
                solutionQuery: "PRAGMA foreign_key_list(departments);",
            }),
        });
        expect(issues).toEqual([]);
    });

    it("does not apply outside Module 2", () => {
        const schema = "CREATE TABLE products (id INTEGER PRIMARY KEY);";
        const issues = validateSqlDataManagementSchemaPractice({
            seed: seed({ moduleNumber: 1, moduleOrder: 2 }),
            draft: draft({ starterSchema: schema, solutionSchema: schema }),
        });
        expect(issues).toEqual([]);
    });
});
