import { describe, expect, it } from "vitest";

import { resolveReviewModuleToolDefaults } from "./useReviewModuleRuntime";

describe("resolveReviewModuleToolDefaults", () => {
    it("returns SQL tool defaults for sql-v2 module metadata", () => {
        const resolved = resolveReviewModuleToolDefaults({
            subjectSlug: "sql-v2",
            mod: {
                id: "sql-v2-1",
                title: "What SELECT Does",
                startPracticeSectionSlug: "s1",
                profileId: "sql",
                versionFamily: "sql",
                runtimeDefaults: {
                    kind: "sql",
                    datasetId: "products_catalog",
                },
                topics: [],
            } as any,
            viewTopic: null,
        });

        expect(resolved.defaultLang).toBe("sql");
        expect(resolved.defaultCode).toContain("SELECT");
        expect(resolved.defaultCode).not.toContain("Hello Python");
    });
});
