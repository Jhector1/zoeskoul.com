import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
    selectCatalogSubjectsForMode,
    selectSeededVisibleSubjectsForActor,
} from "./catalogVisibilityCore";

describe("selectSeededVisibleSubjectsForActor", () => {
    it("shows an unseeded coming-soon subject without making it enrollable", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "linux-terminal-fundamentals",
                subjectId: null,
                enrolled: false,
                status: "coming_soon" as const,
                versioning: {
                    family: "linux",
                    status: "active" as const,
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual([
            "linux-terminal-fundamentals",
        ]);
        expect(visible[0]?.subjectId).toBeNull();
    });

    it("hides an unseeded active subject because it would otherwise look enrollable", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "python-v2",
                subjectId: null,
                enrolled: false,
                status: "active" as const,
                versioning: {
                    family: "python",
                    status: "active" as const,
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible).toEqual([]);
    });

    it("hides manifest subjects that are not seeded in Prisma", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "python-v2",
                subjectId: null,
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible).toEqual([]);
    });

    it("filters unseeded subjects before version family selection", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "python",
                subjectId: "sub_legacy",
                enrolled: true,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                subjectId: null,
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual(["python"]);
    });

    it("selects only the active default seeded subject for a version family", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "python",
                subjectId: "sub_legacy",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                subjectId: "sub_active",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual(["python-v2"]);
    });

    it("catalog prefers the active default even when the learner is enrolled in legacy", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "python",
                subjectId: "sub_legacy",
                enrolled: true,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                subjectId: "sub_active",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual(["python-v2"]);
    });

    it("selects sql-v2 as the SQL default for an unenrolled learner", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "sql",
                subjectId: "sub_sql_legacy",
                enrolled: false,
                versioning: {
                    family: "sql",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                    supersededBy: "sql-v2",
                },
            },
            {
                slug: "sql-v2",
                subjectId: "sub_sql_active",
                enrolled: false,
                versioning: {
                    family: "sql",
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                },
            },
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual(["sql-v2"]);
    });

    it("keeps sql-v2 visible for a learner enrolled in legacy SQL v1 on catalog surfaces", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "sql",
                subjectId: "sub_sql_legacy",
                enrolled: true,
                versioning: {
                    family: "sql",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                    supersededBy: "sql-v2",
                },
            },
            {
                slug: "sql-v2",
                subjectId: "sub_sql_active",
                enrolled: false,
                versioning: {
                    family: "sql",
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                },
            },
        ]);

        expect(visible.map((subject) => subject.slug)).toEqual(["sql-v2"]);
    });

    it("never shows draft or disabled subjects even when seeded", () => {
        const visible = selectSeededVisibleSubjectsForActor([
            {
                slug: "python-draft",
                subjectId: "sub_draft",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "draft",
                    defaultForNewEnrollments: true,
                },
            },
            {
                slug: "sql-disabled",
                subjectId: "sub_disabled",
                enrolled: false,
                versioning: {
                    family: "sql",
                    status: "disabled",
                    defaultForNewEnrollments: true,
                },
            },
        ]);

        expect(visible).toEqual([]);
    });

    it("admin mode keeps unseeded legacy draft and disabled subjects", () => {
        const visible = selectCatalogSubjectsForMode(
            [
                {
                    slug: "python-legacy",
                    subjectId: null,
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "legacy",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-draft",
                    subjectId: null,
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "draft",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-disabled",
                    subjectId: null,
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "disabled",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-v2",
                    subjectId: "sub_active",
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "active",
                        defaultForNewEnrollments: true,
                    },
                },
            ],
            "admin",
        );

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python-legacy",
            "python-draft",
            "python-disabled",
            "python-v2",
        ]);
    });

    it("admin mode shows both SQL legacy and SQL v2 subjects", () => {
        const visible = selectCatalogSubjectsForMode(
            [
                {
                    slug: "sql",
                    subjectId: "sub_sql_legacy",
                    enrolled: false,
                    versioning: {
                        family: "sql",
                        status: "legacy",
                        defaultForNewEnrollments: false,
                        supersededBy: "sql-v2",
                    },
                },
                {
                    slug: "sql-v2",
                    subjectId: "sub_sql_active",
                    enrolled: false,
                    versioning: {
                        family: "sql",
                        status: "active",
                        defaultForNewEnrollments: true,
                        supersedes: "sql",
                    },
                },
            ],
            "admin",
        );

        expect(visible.map((subject) => subject.slug)).toEqual(["sql", "sql-v2"]);
    });

    it("learner mode still hides unseeded draft disabled and duplicate family versions", () => {
        const visible = selectCatalogSubjectsForMode(
            [
                {
                    slug: "python-legacy",
                    subjectId: null,
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "legacy",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-draft",
                    subjectId: "sub_draft",
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "draft",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-disabled",
                    subjectId: "sub_disabled",
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "disabled",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-v2",
                    subjectId: "sub_active",
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "active",
                        defaultForNewEnrollments: true,
                    },
                },
            ],
            "learner",
        );

        expect(visible.map((subject) => subject.slug)).toEqual(["python-v2"]);
    });
    it("preserves catalog subject order after seeded filtering and version-family selection", () => {
        const visible = selectCatalogSubjectsForMode(
            [
                {
                    slug: "python",
                    subjectId: "sub_python_legacy",
                    enrolled: true,
                    versioning: {
                        family: "python",
                        status: "legacy",
                        defaultForNewEnrollments: false,
                    },
                },
                {
                    slug: "python-v2",
                    subjectId: "sub_python_v2",
                    enrolled: false,
                    versioning: {
                        family: "python",
                        status: "active",
                        defaultForNewEnrollments: true,
                    },
                },
                {
                    slug: "python-data-functions",
                    subjectId: "sub_python_data_functions",
                    enrolled: false,
                    versioning: null,
                },
                {
                    slug: "applied-python-projects",
                    subjectId: "sub_applied_python_projects",
                    enrolled: false,
                    versioning: null,
                },
            ],
            "learner",
        );

        expect(visible.map((subject) => subject.slug)).toEqual([
            "python-v2",
            "python-data-functions",
            "applied-python-projects",
        ]);
    });

});
