import { describe, expect, it, vi } from "vitest";
import type { RunSqlFn } from "./runner.js";
import { validateSqlSubmission } from "./validateSqlSubmission.js";

describe("validateSqlSubmission", () => {
    it("uses the shared tolerant table helper for solution comparison", async () => {
        const runSql = vi.fn(async (args: Parameters<RunSqlFn>[0]) => ({
            ok: true,
            columns: ["discounted_unit_price"],
            rows: [
                [args.code.includes("1 -") ? 38.400000000000006 : 38.4],
            ],
        }));

        const result = await validateSqlSubmission({
            learnerSql: "SELECT unit_price - unit_price * pct / 100 AS discounted_unit_price;",
            compareTo: "solution",
            solutionSql: "SELECT unit_price * (1 - pct / 100) AS discounted_unit_price;",
            dialect: "sqlite",
            runSql,
        });

        expect(result.ok).toBe(true);
        expect(runSql).toHaveBeenCalledTimes(2);
    });

    it("accepts equivalent sqlite_master schema text with different indentation", async () => {
        const learnerSchema = [
            "CREATE TABLE products (",
            "    product_id INTEGER PRIMARY KEY,",
            "    product_name TEXT NOT NULL,",
            "    price REAL",
            ")",
        ].join("\n");
        const solutionSchema =
            "CREATE TABLE products(product_id INTEGER PRIMARY KEY, product_name TEXT NOT NULL, price REAL)";

        const runSql = vi.fn(async (args: Parameters<RunSqlFn>[0]) => ({
            ok: true,
            columns: ["sql"],
            rows: [[
                args.code.includes("learner")
                    ? learnerSchema
                    : solutionSchema,
            ]],
        }));

        const result = await validateSqlSubmission({
            learnerSql: "-- learner schema",
            compareTo: "solution",
            solutionSql: "-- reference schema",
            dialect: "sqlite",
            runSql,
        });

        expect(result.ok).toBe(true);
        expect(runSql).toHaveBeenCalledTimes(2);
    });

    it("uses the exact same helper for authored expected-table comparison", async () => {
        const runSql = vi.fn(async (_args: Parameters<RunSqlFn>[0]) => ({
            ok: true,
            columns: ["discounted_unit_price"],
            rows: [[38.4]],
        }));

        const result = await validateSqlSubmission({
            learnerSql: "SELECT 38.4 AS discounted_unit_price;",
            compareTo: "expected_table",
            expectedTable: {
                columns: ["discounted_unit_price"],
                rows: [[38.400000000000006]],
            },
            dialect: "sqlite",
            runSql,
        });

        expect(result.ok).toBe(true);
        expect(runSql).toHaveBeenCalledTimes(1);
    });
});
