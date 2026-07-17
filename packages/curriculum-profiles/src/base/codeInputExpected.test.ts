import { describe, expect, it } from "vitest";
import {
    buildSqlQueryExpected,
    hasTopLevelOrderBy,
} from "./codeInputExpected.js";

function buildExpected(args: {
    solutionCode: string;
    ignoreRowOrder?: boolean;
    testIgnoreRowOrder?: boolean;
}) {
    return buildSqlQueryExpected({
        fixedSqlDialect: "sqlite",
        recipe: {
            type: "sql_query",
            datasetId: "sales_reporting",
            resultShape: "table",
            solutionCode: args.solutionCode,
            ...(typeof args.ignoreRowOrder === "boolean"
                ? { ignoreRowOrder: args.ignoreRowOrder }
                : {}),
            ...(typeof args.testIgnoreRowOrder === "boolean"
                ? {
                    tests: [
                        {
                            compareTo: "solution",
                            ignoreRowOrder: args.testIgnoreRowOrder,
                        },
                    ],
                }
                : {}),
        } as any,
    });
}

describe("SQL expected row-order contracts", () => {
    it("ignores row order when the solution does not define an outer ORDER BY", () => {
        const expected = buildExpected({
            solutionCode:
                "SELECT region, COUNT(*) AS order_count\n" +
                "FROM sales_reporting\n" +
                "GROUP BY region;",
        });

        expect(expected.tests[0]?.ignoreRowOrder).toBe(true);
    });

    it("requires row order when the outer solution query uses ORDER BY", () => {
        const expected = buildExpected({
            solutionCode:
                "SELECT DISTINCT region\n" +
                "FROM sales_reporting\n" +
                "ORDER BY region;",
        });

        expect(expected.tests[0]?.ignoreRowOrder).toBe(false);
    });

    it("does not treat nested, commented, or quoted ORDER BY text as outer sorting", () => {
        expect(
            hasTopLevelOrderBy(
                "SELECT * FROM (SELECT region FROM sales_reporting ORDER BY region) AS grouped;",
            ),
        ).toBe(false);
        expect(
            hasTopLevelOrderBy(
                "SELECT 'ORDER BY region' AS note FROM sales_reporting;",
            ),
        ).toBe(false);
        expect(
            hasTopLevelOrderBy(
                "SELECT region FROM sales_reporting -- ORDER BY region\n;",
            ),
        ).toBe(false);
    });

    it("honors explicit recipe and authored-test overrides", () => {
        expect(
            buildExpected({
                solutionCode:
                    "SELECT region FROM sales_reporting ORDER BY region;",
                ignoreRowOrder: true,
            }).tests[0]?.ignoreRowOrder,
        ).toBe(true);

        expect(
            buildExpected({
                solutionCode: "SELECT region FROM sales_reporting;",
                ignoreRowOrder: true,
                testIgnoreRowOrder: false,
            }).tests[0]?.ignoreRowOrder,
        ).toBe(false);
    });
});
