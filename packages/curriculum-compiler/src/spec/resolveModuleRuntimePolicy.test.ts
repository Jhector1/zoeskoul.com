import { describe, expect, it } from "vitest";
import { resolveModuleRuntimePolicy } from "./resolveModuleRuntimePolicy.js";

describe("resolveModuleRuntimePolicy", () => {
    it("uses the SQL adapter's course-aware reporting fallback", () => {
        const result = resolveModuleRuntimePolicy({
            blueprint: {
                subjectSlug: "sql",
                courseSlug: "sql-analysis-reporting",
                profileId: "sql",
                sourceLocale: "en",
                targetLocales: [],
                title: "SQL Analysis & Reporting",
                level: "intermediate",
                audience: [],
                goals: [],
                constraints: {
                    moduleCount: 6,
                    topicsPerModuleMin: 1,
                    topicsPerModuleMax: 10,
                },
            },
            module: {
                moduleSlug: "sql-analysis-reporting-module-0-report-foundations",
                order: 1,
                runtimePolicy: undefined,
            },
        });

        expect(result).toMatchObject({
            datasetId: "sales_reporting",
        });
    });

    it("keeps SQL V2 module 5 on sales_kpi", () => {
        const result = resolveModuleRuntimePolicy({
            blueprint: {
                subjectSlug: "sql",
                courseSlug: "sql-v2",
                profileId: "sql",
                sourceLocale: "en",
                targetLocales: [],
                title: "SQL V2",
                level: "beginner",
                audience: [],
                goals: [],
                constraints: {
                    moduleCount: 8,
                    topicsPerModuleMin: 1,
                    topicsPerModuleMax: 10,
                },
            },
            module: {
                moduleSlug: "sql-v2-module-5-reporting",
                order: 6,
                runtimePolicy: undefined,
            },
        });

        expect(result).toMatchObject({
            datasetId: "sales_kpi",
        });
    });
});
