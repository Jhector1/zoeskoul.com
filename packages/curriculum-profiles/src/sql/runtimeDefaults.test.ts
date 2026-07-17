import { describe, expect, it } from "vitest";
import { resolveSqlRuntimeDefaults } from "./runtimeDefaults.js";

describe("resolveSqlRuntimeDefaults", () => {
    it("uses the dedicated reporting dataset as the course-aware fallback", () => {
        expect(
            resolveSqlRuntimeDefaults({
                courseSlug: "sql-analysis-reporting",
                moduleOrder: 1,
            }),
        ).toMatchObject({
            kind: "sql",
            datasetId: "sales_reporting",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        });
    });

    it("keeps SQL V2 module 5 on the legacy orders dataset", () => {
        expect(
            resolveSqlRuntimeDefaults({
                courseSlug: "sql-v2",
                moduleOrder: 6,
            }),
        ).toMatchObject({
            kind: "sql",
            datasetId: "sales_kpi",
        });
    });

    it("lets explicit module runtime policy override the course fallback", () => {
        expect(
            resolveSqlRuntimeDefaults({
                courseSlug: "sql-analysis-reporting",
                moduleOrder: 1,
                runtimePolicy: {
                    datasetId: "students_intro",
                    sqlDialect: "sqlite",
                },
            }),
        ).toMatchObject({
            datasetId: "students_intro",
        });
    });
});
