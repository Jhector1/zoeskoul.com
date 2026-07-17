import { beforeEach, describe, expect, it, vi } from "vitest";

const { validateSqlSubmissionMock, runCodeMock } = vi.hoisted(() => ({
    validateSqlSubmissionMock: vi.fn(),
    runCodeMock: vi.fn(),
}));

vi.mock("@zoeskoul/curriculum-runtime/sql", () => ({
    validateSqlSubmission: validateSqlSubmissionMock,
}));
vi.mock("@/lib/code/runCode", () => ({ runCode: runCodeMock }));
vi.mock("@/lib/subjects/sql/sql/datasets", () => ({
    getSqlDataset: vi.fn(() => null),
}));

import {
    composeSqlWorkspaceSubmission,
    gradeSqlCodeInput,
} from "./codeInput.sql";

function expected(overrides: Record<string, unknown> = {}) {
    return {
        strategy: "sql",
        language: "sql",
        fixedSqlDialect: "sqlite",
        solutionCode: [
            "-- file: schema.sql",
            "CREATE TABLE products (id INTEGER PRIMARY KEY);",
            "-- file: query.sql",
            "SELECT sql FROM sqlite_master WHERE name = 'products';",
        ].join("\n"),
        sqlFileOrder: ["schema.sql", "query.sql"],
        workspaceExpectations: {
            requiredFiles: ["schema.sql", "query.sql"],
        },
        sourceChecks: [
            {
                type: "source_regex",
                pattern: "\\bCREATE\\s+TABLE\\s+products\\b",
                message: "Create the `products` table in schema.sql.",
            },
            {
                type: "source_regex",
                pattern: "\\bSELECT\\b[\\s\\S]*?\\bFROM\\s+sqlite_master\\b",
                message: "Write the inspection SELECT in query.sql.",
            },
        ],
        tests: [{
            compareTo: "solution",
            checkSql: "SELECT sql FROM sqlite_master WHERE name = 'products';",
        }],
        ...overrides,
    } as any;
}

const completeFiles = [
    { kind: "file" as const, path: "schema.sql", content: "CREATE TABLE products (id INTEGER PRIMARY KEY);" },
    { kind: "file" as const, path: "query.sql", content: "SELECT sql FROM sqlite_master WHERE name = 'products';" },
];

describe("multi-file SQL grading", () => {
    beforeEach(() => {
        validateSqlSubmissionMock.mockReset();
        runCodeMock.mockReset();
    });

    it("composes submitted files in authored execution order", () => {
        const result = composeSqlWorkspaceSubmission({
            code: completeFiles[1].content,
            entry: "query.sql",
            files: [...completeFiles].reverse(),
            sqlFileOrder: ["schema.sql", "query.sql"],
        });
        expect(result.sql.indexOf("-- file: schema.sql")).toBeLessThan(
            result.sql.indexOf("-- file: query.sql"),
        );
    });

    it("grades the complete workspace instead of only the active file", async () => {
        validateSqlSubmissionMock.mockResolvedValue({ ok: true });
        const result = await gradeSqlCodeInput({
            expected: expected(),
            code: completeFiles[1].content,
            entry: "query.sql",
            files: completeFiles,
            showDebug: false,
        });
        expect(result.ok).toBe(true);
        const learnerSql = validateSqlSubmissionMock.mock.calls[0][0].learnerSql;
        expect(learnerSql).toContain("CREATE TABLE products");
        expect(learnerSql).toContain("FROM sqlite_master");
    });

    it("returns a stable setup error for an invalid authored source-check pattern", async () => {
        const result = await gradeSqlCodeInput({
            expected: expected({
                sourceChecks: [
                    {
                        type: "source_regex",
                        pattern: "[",
                        message: "This message should not be shown to the learner.",
                        path: "schema.sql",
                    },
                ],
            }),
            code: completeFiles[1].content,
            entry: "query.sql",
            files: completeFiles,
            showDebug: false,
        });

        expect(result).toEqual({
            ok: false,
            explanation:
                "Server bug: this exercise contains an invalid SQL source-check pattern.",
            feedback: null,
        });
        expect(validateSqlSubmissionMock).not.toHaveBeenCalled();
        expect(runCodeMock).not.toHaveBeenCalled();
    });

    it("reports the exact missing learner SQL step before execution", async () => {
        const result = await gradeSqlCodeInput({
            expected: expected(),
            code: "-- Inspect products here.\n",
            entry: "query.sql",
            files: [
                completeFiles[0],
                { kind: "file", path: "query.sql", content: "-- Inspect products here.\n" },
            ],
            showDebug: false,
        });
        expect(result.feedback?.title).toBe("Required SQL step is missing");
        expect(result.feedback?.message).toBe("Write the inspection SELECT in query.sql.");
        expect(validateSqlSubmissionMock).not.toHaveBeenCalled();
    });

    it("uses schema-specific mismatch feedback for DDL exercises", async () => {
        validateSqlSubmissionMock.mockResolvedValue({
            ok: false,
            errorStage: "table_mismatch",
        });
        const result = await gradeSqlCodeInput({
            expected: expected(),
            code: completeFiles[1].content,
            entry: "query.sql",
            files: completeFiles,
            showDebug: false,
        });
        expect(result.feedback?.title).toBe("Schema result is not correct");
        expect(result.feedback?.message).toContain("schema.sql");
        expect(result.feedback?.message).not.toContain("inserted, updated, or deleted");
    });
});
