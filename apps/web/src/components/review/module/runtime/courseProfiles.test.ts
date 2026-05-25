import { describe, expect, it } from "vitest";

import {
    getCourseProfile,
    resolveCourseLanguage,
    resolveCourseFileSeed,
    resolveCourseSqlRunnerConfig,
    resolveRuntimeDefaultDataset,
} from "./courseProfiles";

describe("getCourseProfile", () => {
    it("resolves sql-v2 as SQL from profileId metadata", () => {
        expect(
            getCourseProfile({
                subjectSlug: "sql-v2",
                profileId: "sql",
            }).id,
        ).toBe("sql");
    });

    it("resolves sql-v2 as SQL from version family metadata", () => {
        expect(
            getCourseProfile({
                subjectSlug: "sql-v2",
                versionFamily: "sql",
            }).id,
        ).toBe("sql");
    });

    it("resolves a nonstandard SQL slug from profile metadata", () => {
        expect(
            getCourseProfile({
                subjectSlug: "sql-preview",
                profileId: "sql",
            }).id,
        ).toBe("sql");
    });

    it("resolves python-v2 as Python from metadata", () => {
        expect(
            getCourseProfile({
                subjectSlug: "python-v2",
                profileId: "python",
                versionFamily: "python",
            }).id,
        ).toBe("python");
    });

    it("keeps unknown subjects generic without metadata", () => {
        expect(
            getCourseProfile({
                subjectSlug: "sql-preview",
            }).id,
        ).toBe("generic");
    });
});

describe("resolveRuntimeDefaultDataset", () => {
    it("resolves inherited SQL datasets for sql-v2 from profile metadata", () => {
        const resolved = resolveRuntimeDefaultDataset({
            subjectSlug: "sql-v2",
            profileId: "sql",
            versionFamily: "sql",
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved).toEqual({
            datasetId: "students_intro",
            source: "module.runtimeDefaults",
        });
    });

    it("stays generic for non-SQL subjects without metadata or language", () => {
        expect(
            resolveRuntimeDefaultDataset({
                subjectSlug: "sql-preview",
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "students_intro",
                },
            }),
        ).toEqual({ source: "none" });
    });
});

describe("resolveCourseSqlRunnerConfig", () => {
    it("resolves sql-v2 module defaults as SQL from profile metadata", () => {
        const resolved = resolveCourseSqlRunnerConfig({
            subjectSlug: "sql-v2",
            profileId: "sql",
            versionFamily: "sql",
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.isSql).toBe(true);
        expect(resolved.sqlDatasetId).toBe("students_intro");
    });

    it("uses runtimeDefaults.kind as a defensive SQL fallback", () => {
        expect(
            resolveCourseLanguage({
                subjectSlug: "sql-v2",
                runtimeDefaults: {
                    kind: "sql",
                    datasetId: "students_intro",
                },
            }),
        ).toBe("sql");

        const resolved = resolveCourseSqlRunnerConfig({
            subjectSlug: "sql-v2",
            runtimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.isSql).toBe(true);
        expect(resolved.sqlDatasetId).toBe("students_intro");
    });
});

describe("resolveCourseFileSeed", () => {
    it("merges starter files with workspace fixture files for python exercises", () => {
        const resolved = resolveCourseFileSeed({
            subjectSlug: "python-data-functions",
            language: "python",
            profileId: "python",
            versionFamily: "python",
            target: {
                kind: "code_input",
                language: "python",
                starterFiles: [
                    {
                        path: "main.py",
                        content: "# Write your answer below",
                        isEntry: true,
                    },
                    {
                        path: "data.txt",
                        content: "Hello from starterFiles",
                    },
                ],
                workspace: {
                    starterFiles: [
                        {
                            path: "main.py",
                            content: "# Write your answer below",
                            isEntry: true,
                        },
                    ],
                    files: [
                        {
                            path: "data.txt",
                            content: "Hello from workspace.files",
                        },
                    ],
                },
            },
        });

        expect(resolved.starterFiles).toEqual([
            {
                path: "main.py",
                content: "# Write your answer below",
            },
            {
                path: "data.txt",
                content: "Hello from workspace.files",
            },
        ]);
    });

    it("preserves the first main file instead of letting later sources overwrite it", () => {
        const resolved = resolveCourseFileSeed({
            subjectSlug: "python-data-functions",
            language: "python",
            profileId: "python",
            versionFamily: "python",
            target: {
                workspace: {
                    starterFiles: [
                        {
                            path: "main.py",
                            content: "# starter main",
                            isEntry: true,
                        },
                    ],
                },
                starterFiles: [
                    {
                        path: "main.py",
                        content: "# later main",
                        isEntry: true,
                    },
                    {
                        path: "data.txt",
                        content: "fixture",
                    },
                ],
            },
        });

        expect(resolved.starterFiles).toEqual([
            {
                path: "main.py",
                content: "# starter main",
            },
            {
                path: "data.txt",
                content: "fixture",
            },
        ]);
    });
});
