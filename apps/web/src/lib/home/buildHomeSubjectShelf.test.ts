import { describe, expect, it } from "vitest";

import { buildHomeSubjectShelf } from "./buildHomeSubjectShelf";

type Subject = {
    slug: string;
    enrolled: boolean;
    lastSeenAt: string | null;
};

function subject(
    slug: string,
    options: Partial<Omit<Subject, "slug">> = {},
): Subject {
    return {
        slug,
        enrolled: false,
        lastSeenAt: null,
        ...options,
    };
}

describe("buildHomeSubjectShelf", () => {
    it("shows four recommendations when the learner has no current courses", () => {
        const result = buildHomeSubjectShelf(
            [subject("python"), subject("sql"), subject("linux"), subject("git"), subject("oop")],
            [],
        );

        expect(result.map((item) => [item.subject.slug, item.kind])).toEqual([
            ["python", "recommended"],
            ["sql", "recommended"],
            ["linux", "recommended"],
            ["git", "recommended"],
        ]);
    });

    it("places current courses first and fills the remaining slots with recommendations", () => {
        const result = buildHomeSubjectShelf(
            [
                subject("python", {
                    enrolled: true,
                    lastSeenAt: "2026-07-20T10:00:00.000Z",
                }),
                subject("sql"),
                subject("linux"),
                subject("git"),
                subject("oop"),
            ],
            [],
        );

        expect(result.map((item) => [item.subject.slug, item.kind])).toEqual([
            ["python", "current"],
            ["sql", "recommended"],
            ["linux", "recommended"],
            ["git", "recommended"],
        ]);
    });

    it("orders multiple current courses by latest activity", () => {
        const result = buildHomeSubjectShelf(
            [
                subject("python", {
                    enrolled: true,
                    lastSeenAt: "2026-07-18T10:00:00.000Z",
                }),
                subject("sql", {
                    enrolled: true,
                    lastSeenAt: "2026-07-21T10:00:00.000Z",
                }),
                subject("linux"),
                subject("git"),
            ],
            [],
        );

        expect(result.map((item) => [item.subject.slug, item.kind])).toEqual([
            ["sql", "current"],
            ["python", "current"],
            ["linux", "recommended"],
            ["git", "recommended"],
        ]);
    });

    it("shows only the four most recent current courses when five are enrolled", () => {
        const result = buildHomeSubjectShelf(
            [
                subject("one", { enrolled: true, lastSeenAt: "2026-07-01T00:00:00.000Z" }),
                subject("two", { enrolled: true, lastSeenAt: "2026-07-02T00:00:00.000Z" }),
                subject("three", { enrolled: true, lastSeenAt: "2026-07-03T00:00:00.000Z" }),
                subject("four", { enrolled: true, lastSeenAt: "2026-07-04T00:00:00.000Z" }),
                subject("five", { enrolled: true, lastSeenAt: "2026-07-05T00:00:00.000Z" }),
                subject("recommended"),
            ],
            [],
        );

        expect(result.map((item) => [item.subject.slug, item.kind])).toEqual([
            ["five", "current"],
            ["four", "current"],
            ["three", "current"],
            ["two", "current"],
        ]);
    });

    it("uses onboarding interests only to rank non-enrolled recommendations", () => {
        const result = buildHomeSubjectShelf(
            [
                subject("python", {
                    enrolled: true,
                    lastSeenAt: "2026-07-20T10:00:00.000Z",
                }),
                subject("sql"),
                subject("linux"),
                subject("git"),
            ],
            ["git", "python", "sql"],
        );

        expect(result.map((item) => [item.subject.slug, item.kind])).toEqual([
            ["python", "current"],
            ["git", "recommended"],
            ["sql", "recommended"],
            ["linux", "recommended"],
        ]);
    });
});
