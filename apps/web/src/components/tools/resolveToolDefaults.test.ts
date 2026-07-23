import { describe, expect, it } from "vitest";

import {
    resolveToolDefaults,
    toolDefaultsForLanguage,
} from "./resolveToolDefaults";

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
        expect(resolved.defaultCode).toContain("SELECT");
    });

    it("keeps python-v2 on Python defaults from metadata", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "python-v2",
            profileId: "python",
            versionFamily: "python",
        });

        expect(resolved.defaultLang).toBe("python");
        expect(resolved.defaultCode).toContain("print(");
    });

    it("resolves a nonstandard C course from profile metadata", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "c-data-structures",
            profileId: "c",
            versionFamily: "c-data-structures",
        });

        expect(resolved.defaultLang).toBe("c");
        expect(resolved.defaultCode).toContain("#include <stdio.h>");
        expect(resolved.defaultCode).not.toContain("Hello from Python");
    });

    it("uses an authored language override through the same shared defaults", () => {
        const resolved = resolveToolDefaults({
            subjectSlug: "custom-course",
            moduleMeta: {
                toolDefaults: {
                    defaultLang: "javascript",
                },
            },
        });

        expect(resolved).toEqual(toolDefaultsForLanguage("javascript"));
    });
});

it("resolves Git terminal courses to Bash defaults", () => {
    const resolved = resolveToolDefaults({
        subjectSlug: "git-foundations",
        profileId: "git",
        versionFamily: "git-foundations",
        runtimeDefaults: {
            kind: "code",
            language: "bash",
            supportsTerminal: true,
        },
    });

    expect(resolved.defaultLang).toBe("bash");
    expect(resolved.defaultCode).toContain("echo");
    expect(resolved.defaultCode).not.toContain("Hello from Python");
});
