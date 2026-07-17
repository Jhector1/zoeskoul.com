import { describe, expect, it, vi } from "vitest";
import { validateSqlAgainstSolution } from "./validateSqlAgainstSolution.js";
import type { RunSqlFn } from "./runner.js";

describe("validateSqlAgainstSolution", () => {
    it("grades equivalent SQL by its result table rather than source text", async () => {
        const runSql = vi.fn(async (_args: Parameters<RunSqlFn>[0]) => ({
            ok: true,
            columns: ["region"],
            rows: [["East"], ["North"], ["South"], ["West"]],
        }));

        const result = await validateSqlAgainstSolution({
            learnerSql:
                "SELECT\n" +
                "    DISTINCT region\n" +
                "FROM sales_reporting ORDER BY region ASC;",
            solutionSql:
                "SELECT DISTINCT region\n" +
                "FROM sales_reporting\n" +
                "ORDER BY region;",
            dialect: "sqlite",
            datasetId: "sales_reporting",
            runSql,
        });

        expect(result.ok).toBe(true);
        expect(runSql).toHaveBeenCalledTimes(2);
        expect(runSql.mock.calls[0]?.[0].code).not.toBe(
            runSql.mock.calls[1]?.[0].code,
        );
    });
});
