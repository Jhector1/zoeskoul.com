import { describe, expect, it } from "vitest";

import { resolveToolDefaults } from "./resolveToolDefaults";

describe("resolveToolDefaults", () => {
    it("resolves sql-v2 to SQL from profile metadata", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "sql-v2",
            profileId: "sql",
            versionFamily: "sql",
            runtimeDefaults: { kind: "sql" },
        });

        expect(resolved.defaultLang).toBe("sql");
        expect(resolved.defaultCode).toContain("SELECT");
        expect(resolved.defaultCode).toContain("Hello SQL");
    });

    it("resolves sql-v2 to SQL from runtime kind alone", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "sql-v2",
            runtimeDefaults: { kind: "sql" },
        });

        expect(resolved.defaultLang).toBe("sql");
        expect(resolved.defaultCode).toContain("SELECT");
    });

    it("resolves nonstandard SQL slugs from SQL profile metadata", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "sql-foundations-preview",
            profileId: "sql",
        });

        expect(resolved.defaultLang).toBe("sql");
        expect(resolved.defaultCode).toContain("Hello SQL");
    });

    it("keeps python-v2 on Python defaults from metadata", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "python-v2",
            profileId: "python",
            versionFamily: "python",
        });

        expect(resolved.defaultLang).toBe("python");
        expect(resolved.defaultCode).toContain('print("Hello Python!")');
    });
});
