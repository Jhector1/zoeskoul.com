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
});
