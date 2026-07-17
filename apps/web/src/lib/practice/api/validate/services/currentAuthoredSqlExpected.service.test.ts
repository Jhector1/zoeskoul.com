import { describe, expect, it } from "vitest";
import { buildCurrentAuthoredSqlExpectedFromExercise } from "./currentAuthoredSqlExpected.service";

describe("buildCurrentAuthoredSqlExpectedFromExercise", () => {
    it("preserves multi-file order, source checks, and required files", () => {
        const expected = buildCurrentAuthoredSqlExpectedFromExercise({
            kind: "code_input",
            fixedSqlDialect: "sqlite",
            workspaceExpectations: {
                requiredFiles: ["schema.sql", "query.sql"],
            },
            recipe: {
                type: "sql_query",
                datasetId: "ddl_blank",
                resultShape: "table",
                solutionCode: [
                    "-- file: schema.sql",
                    "CREATE TABLE products (id INTEGER);",
                    "-- file: query.sql",
                    "SELECT sql FROM sqlite_master;",
                ].join("\n"),
                checkSql: "SELECT sql FROM sqlite_master;",
                sqlFileOrder: ["schema.sql", "query.sql"],
                sourceChecks: [{
                    type: "source_regex",
                    pattern: "CREATE\\s+TABLE",
                    message: "Create the table.",
                }],
                solutionFiles: [
                    { path: "schema.sql", content: "CREATE TABLE products (id INTEGER);" },
                    { path: "query.sql", content: "SELECT sql FROM sqlite_master;" },
                ],
            },
        });
        expect(expected).toMatchObject({
            sqlFileOrder: ["schema.sql", "query.sql"],
            workspaceExpectations: {
                requiredFiles: ["schema.sql", "query.sql"],
            },
            sourceChecks: expect.any(Array),
            solutionFiles: expect.any(Array),
        });
    });
});
