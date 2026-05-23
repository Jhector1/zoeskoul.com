import { describe, expect, it } from "vitest";

import { buildSubjectManifestFromPlan } from "./buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "./buildSubjectMessagesFromPlan.js";

function makeArgs(learningObjectives: string[]) {
    return {
        blueprint: {
            subjectSlug: "sql-v2",
            profileId: "sql",
            catalogSlug: "sql",
            title: "SQL Foundations",
            description: "Learn SQL",
            versioning: {
                family: "sql",
                version: 2,
                status: "active",
                defaultForNewEnrollments: true,
                supersedes: "sql",
                supersededBy: null,
            },
        },
        plan: {
            modules: [
                {
                    moduleSlug: "sql-v2-0",
                    prefix: "sqlv2_0",
                    order: 1,
                    title: "Module 0",
                    description: "Module description",
                    purpose: "Purpose",
                    learningObjectives,
                    weekStart: null,
                    weekEnd: null,
                    runtimePolicy: null,
                    sections: [
                        {
                            sectionSlug: "sql-v2-0-1",
                            order: 1,
                            title: "Section 1",
                            description: "Section description",
                            weeksLabel: null,
                            weekStart: null,
                            weekEnd: null,
                            bullets: [],
                            topics: [
                                {
                                    topicId: "what_sql_means",
                                    title: "What SQL Means",
                                    minutes: 10,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        shape: {
            subjectManifest: {
                genKey: "sql_for_beginners",
                accessPolicyDefault: "free",
                statusDefault: "active",
                completionPolicy: {
                    requireAllPublishedModules: true,
                },
                moduleSlug: (index: number) => `sql-v2-${index}`,
                keyPatterns: {
                    subjectTitleKey: (subjectSlug: string) => `subjects.${subjectSlug}.title`,
                    subjectDescriptionKey: (subjectSlug: string) => `subjects.${subjectSlug}.description`,
                    subjectMoreComingKey: (subjectSlug: string) => `subjects.${subjectSlug}.moreComingSoon`,
                    moduleTitleKey: (subjectSlug: string, moduleSlug: string) => `modules.${subjectSlug}.${moduleSlug}.title`,
                    moduleDescriptionKey: (subjectSlug: string, moduleSlug: string) => `modules.${subjectSlug}.${moduleSlug}.description`,
                    moduleOutcomeKey: (subjectSlug: string, moduleSlug: string, i: number) =>
                        `modules.${subjectSlug}.${moduleSlug}.outcomes.${i}`,
                    moduleWhyKey: (subjectSlug: string, moduleSlug: string, i: number) =>
                        `modules.${subjectSlug}.${moduleSlug}.why.${i}`,
                    sectionTitleKey: (subjectSlug: string, moduleSlug: string, sectionSlug: string) =>
                        `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.title`,
                    sectionDescriptionKey: (subjectSlug: string, moduleSlug: string, sectionSlug: string) =>
                        `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.description`,
                    sectionWeeksKey: (subjectSlug: string, moduleSlug: string, sectionSlug: string) =>
                        `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.weeks`,
                    sectionBulletKey: (
                        subjectSlug: string,
                        moduleSlug: string,
                        sectionSlug: string,
                        i: number,
                    ) => `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.bullets.${i}`,
                },
            },
        },
    } as any;
}

describe("subject outcomes generation", () => {
    it("emits zero outcome keys and messages when outcomes are empty", () => {
        const args = makeArgs([]);
        const manifest = buildSubjectManifestFromPlan(args);
        const messages = buildSubjectMessagesFromPlan(args);

        expect(manifest.modules[0]?.meta?.outcomeKeys).toEqual([]);
        expect(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes).toEqual([]);
    });

    it("keeps manifest keys and messages aligned for two outcomes", () => {
        const args = makeArgs(["Read tables", "Write SELECT queries"]);
        const manifest = buildSubjectManifestFromPlan(args);
        const messages = buildSubjectMessagesFromPlan(args);

        expect(manifest.modules[0]?.meta?.outcomeKeys).toHaveLength(2);
        expect(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes).toHaveLength(2);
        expect(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes.every(Boolean)).toBe(true);
    });

    it("removes duplicate and blank learning objectives before emitting keys and messages", () => {
        const args = makeArgs([
            " Read tables ",
            "",
            "Read tables",
            "   ",
            "Write SELECT queries",
        ]);
        const manifest = buildSubjectManifestFromPlan(args);
        const messages = buildSubjectMessagesFromPlan(args);

        expect(manifest.modules[0]?.meta?.outcomeKeys).toHaveLength(2);
        expect(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes).toEqual([
            "Read tables",
            "Write SELECT queries",
        ]);
    });

    it("keeps manifest keys and messages aligned for five outcomes", () => {
        const args = makeArgs([
            "One",
            "Two",
            "Three",
            "Four",
            "Five",
        ]);
        const manifest = buildSubjectManifestFromPlan(args);
        const messages = buildSubjectMessagesFromPlan(args);

        expect(manifest.modules[0]?.meta?.outcomeKeys).toHaveLength(5);
        expect(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes).toHaveLength(5);
        expect(
            manifest.modules[0]?.meta?.outcomeKeys?.every((key) => {
                const match = /\.outcomes\.(\d+)$/.exec(key);
                const idx = match ? Number(match[1]) : -1;
                return idx >= 0 && Boolean(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes[idx]);
            }),
        ).toBe(true);
    });

    it("caps emitted outcomes at five", () => {
        const args = makeArgs([
            "One",
            "Two",
            "Three",
            "Four",
            "Five",
            "Six",
            "Seven",
        ]);
        const manifest = buildSubjectManifestFromPlan(args);
        const messages = buildSubjectMessagesFromPlan(args);

        expect(manifest.modules[0]?.meta?.outcomeKeys).toHaveLength(5);
        expect(messages.modules["sql-v2"]?.["sql-v2-0"]?.outcomes).toEqual([
            "One",
            "Two",
            "Three",
            "Four",
            "Five",
        ]);
    });
});
