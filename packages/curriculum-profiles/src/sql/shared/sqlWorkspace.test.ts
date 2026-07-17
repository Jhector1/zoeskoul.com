import { describe, expect, it } from "vitest";
import { buildSqlDraftProgram, resolveSqlFileOrder } from "./sqlWorkspace.js";

describe("SQL authoring workspace helpers", () => {
    it("builds a complete draft program in authored file order", () => {
        const exercise = {
            id: "inventory-launch",
            kind: "code_input" as const,
            title: "Launch inventory",
            prompt: "Build and verify the database.",
            hint: "Keep each concern in its assigned file.",
            help: { concept: "Ordered files", hint_1: "Schema first", hint_2: "Query last" },
            starterCode: "SELECT * FROM products;",
            solutionCode: "SELECT * FROM products;",
            recipeType: "sql_query" as const,
            entryFilePath: "query.sql",
            sqlFileOrder: ["schema.sql", "seed.sql", "query.sql"],
            solutionFiles: [
                { path: "query.sql", content: "SELECT * FROM products;", isEntry: true },
                { path: "schema.sql", content: "CREATE TABLE products (id INTEGER);" },
                { path: "seed.sql", content: "INSERT INTO products (id) VALUES (1);" },
            ],
        };

        expect(buildSqlDraftProgram(exercise, "solution")).toBe([
            "-- file: schema.sql",
            "CREATE TABLE products (id INTEGER);",
            "",
            "-- file: seed.sql",
            "INSERT INTO products (id) VALUES (1);",
            "",
            "-- file: query.sql",
            "SELECT * FROM products;",
        ].join("\n"));
    });

    it("requires every solution file exactly once", () => {
        expect(() =>
            resolveSqlFileOrder({
                exerciseId: "broken",
                authoredOrder: ["query.sql"],
                files: [
                    { path: "schema.sql", content: "CREATE TABLE x (id INTEGER);" },
                    { path: "query.sql", content: "SELECT * FROM x;" },
                ],
                entryFilePath: "query.sql",
            }),
        ).toThrow(/list every solution file exactly once/i);
    });
});
