import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
    selectVisibleSubjectsForActor,
} from "./subjectVisibilityCore";
type Subject = {
    slug: string;
    enrolled?: boolean;
    subjectId?: string | null;
    versioning?: {
        family?: string;
        status?: "draft" | "active" | "legacy" | "disabled";
        defaultForNewEnrollments?: boolean;
    } | null;
};

function slugs(subjects: Subject[]) {
    return subjects.map((subject) => subject.slug);
}

describe("subject version visibility", () => {
    it("shows only the active default version to a new user", () => {
        const subjects: Subject[] = [
            {
                slug: "python",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ];

        expect(slugs(selectVisibleSubjectsForActor(subjects))).toEqual([
            "python-v2",
        ]);
    });

    it("shows the legacy version only to a learner enrolled in the legacy version", () => {
        const subjects: Subject[] = [
            {
                slug: "python",
                enrolled: true,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ];

        expect(slugs(selectVisibleSubjectsForActor(subjects))).toEqual([
            "python",
        ]);
    });

    it("shows the active version to a learner enrolled in the active version", () => {
        const subjects: Subject[] = [
            {
                slug: "python",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                enrolled: true,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ];

        expect(slugs(selectVisibleSubjectsForActor(subjects))).toEqual([
            "python-v2",
        ]);
    });

    it("does not show draft or disabled versions to a new user", () => {
        const subjects: Subject[] = [
            {
                slug: "python-draft",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "draft",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-disabled",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "disabled",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ];

        expect(slugs(selectVisibleSubjectsForActor(subjects))).toEqual([
            "python-v2",
        ]);
    });

    it("keeps separate version families independent", () => {
        const subjects: Subject[] = [
            {
                slug: "python",
                enrolled: true,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
            {
                slug: "sql",
                enrolled: false,
                versioning: {
                    family: "sql",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
        ];

        expect(slugs(selectVisibleSubjectsForActor(subjects))).toEqual([
            "python",
            "sql",
        ]);
    });

    it("does not double-count multiple versions from the same family", () => {
        const subjects: Subject[] = [
            {
                slug: "python",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "legacy",
                    defaultForNewEnrollments: false,
                },
            },
            {
                slug: "python-v2",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "active",
                    defaultForNewEnrollments: true,
                },
            },
            {
                slug: "python-v3-draft",
                enrolled: false,
                versioning: {
                    family: "python",
                    status: "draft",
                    defaultForNewEnrollments: false,
                },
            },
        ];

        const visible = selectVisibleSubjectsForActor(subjects);

        expect(visible).toHaveLength(1);
        expect(slugs(visible)).toEqual(["python-v2"]);
    });
});