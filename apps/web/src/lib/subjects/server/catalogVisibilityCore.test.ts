import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {selectCatalogSubjectsForMode, selectSeededVisibleSubjectsForActor} from "./catalogVisibilityCore";

describe("selectSeededVisibleSubjectsForActor", () => {
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

    it("keeps an enrolled legacy subject visible instead of switching to active default", () => {
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

        expect(visible.map((subject) => subject.slug)).toEqual(["python"]);
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

    it("keeps sql visible for a learner enrolled in legacy SQL v1", () => {
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

        expect(visible.map((subject) => subject.slug)).toEqual(["sql"]);
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
});
