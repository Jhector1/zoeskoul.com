import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul-code-input-expected", () => ({
    buildFixedTestsExpected: () => ({}),
}));

import { defineCourseFromManifest } from "./defineCourseFromManifest";

describe("defineCourseFromManifest", () => {
    it("copies subject profile metadata onto built modules", () => {
        const course = defineCourseFromManifest({
            manifest: {
                subject: {
                    slug: "sql-v2",
                    profileId: "sql",
                    catalogSlug: "sql",
                    genKey: "sql_for_beginners",
                    order: 30,
                    titleKey: "subjects.sql-v2.title",
                    meta: {
                        versioning: {
                            family: "sql",
                            version: 2,
                            status: "active",
                            defaultForNewEnrollments: true,
                            supersedes: "sql",
                            supersededBy: null,
                        },
                    },
                },
                modules: [
                    {
                        slug: "sql-v2-0",
                        prefix: "sqlv2_0",
                        order: 0,
                        titleKey: "modules.sql-v2.sql-v2-0.title",
                        sections: [
                            {
                                slug: "sql-v2-0-1",
                                order: 1,
                                titleKey: "sections.sql-v2.sql-v2-0.sql-v2-0-1.title",
                                topics: ["what_sql_means"],
                            },
                        ],
                    },
                ],
            } as any,
            topicManifests: {
                what_sql_means: {
                    topicId: "what_sql_means",
                    minutes: 5,
                    topic: {
                        labelKey: "topics.sql-v2.what_sql_means.label",
                        summaryKey: "topics.sql-v2.what_sql_means.summary",
                    },
                    cards: [],
                    sketches: [],
                    exercises: [],
                },
            },
        });

        expect(course.modules[0]?.module.profileId).toBe("sql");
        expect(course.modules[0]?.module.versionFamily).toBe("sql");
    });

    it("merges runtimeDefaults from subject through topic with topic precedence", () => {
        const course = defineCourseFromManifest({
            manifest: {
                subject: {
                    slug: "linux",
                    profileId: "bash",
                    catalogSlug: "linux",
                    genKey: "linux_terminal_fundamentals",
                    order: 10,
                    titleKey: "subjects.linux.title",
                    runtimeDefaults: {
                        kind: "code",
                        language: "bash",
                        supportsFileSystem: true,
                        fileActions: {
                            enabled: true,
                            createFile: false,
                        },
                    },
                },
                modules: [
                    {
                        slug: "linux-1",
                        prefix: "linux_1",
                        order: 1,
                        titleKey: "modules.linux.1.title",
                        runtimeDefaults: {
                            kind: "code",
                            supportsMultiFile: true,
                            fileActions: {
                                createFolder: false,
                            },
                        },
                        sections: [
                            {
                                slug: "linux-1-1",
                                order: 1,
                                titleKey: "sections.linux.1.1.title",
                                runtimeDefaults: {
                                    kind: "code",
                                    supportsTerminal: true,
                                    fileActions: {
                                        rename: false,
                                    },
                                },
                                topics: ["what-the-terminal-is"],
                            },
                        ],
                    },
                ],
            } as any,
            topicManifests: {
                "what-the-terminal-is": {
                    topicId: "what-the-terminal-is",
                    minutes: 5,
                    topic: {
                        labelKey: "topics.linux.what_the_terminal_is.label",
                        summaryKey: "topics.linux.what_the_terminal_is.summary",
                    },
                    runtimeDefaults: {
                        kind: "code",
                        fileActions: {
                            createFile: true,
                            dragDrop: false,
                        },
                    },
                    cards: [],
                    sketches: [],
                    exercises: [],
                },
            },
        });

        expect(course.modules[0]?.sections[0]?.topics[0]?.def.meta.runtimeDefaults).toEqual({
            kind: "code",
            language: "bash",
            supportsFileSystem: true,
            supportsMultiFile: true,
            supportsTerminal: true,
            fileActions: {
                enabled: true,
                createFile: true,
                createFolder: false,
                rename: false,
                dragDrop: false,
            },
        });
    });
});
