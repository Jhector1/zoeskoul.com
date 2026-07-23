import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { buildSubjectManifestFromPlan } from "./buildSubjectManifestFromPlan.js";

function makeArgs(overrides?: {
    blueprint?: Record<string, unknown>;
    modules?: Array<Record<string, unknown>>;
}) {
    const modules = overrides?.modules ?? [
        {
            moduleSlug: "python-v2-0",
            prefix: "py0",
            order: 1,
            title: "Module 0",
            description: "Intro module",
            weekStart: null,
            weekEnd: null,
            sections: [
                {
                    sectionSlug: "python-v2-0-1",
                    order: 1,
                    title: "Section 1",
                    description: "Section 1 description",
                    topics: [
                        {
                            topicId: "topic-1",
                            order: 1,
                            title: "Topic 1",
                            summary: "Topic 1 summary",
                            minutes: 15,
                            learningGoals: ["Goal 1"],
                        },
                    ],
                },
            ],
        },
        {
            moduleSlug: "python-v2-1",
            prefix: "py1",
            order: 2,
            title: "Module 1",
            description: "Second module",
            weekStart: null,
            weekEnd: null,
            sections: [
                {
                    sectionSlug: "python-v2-1-1",
                    order: 1,
                    title: "Section 1",
                    description: "Section 1 description",
                    topics: [
                        {
                            topicId: "topic-2",
                            order: 1,
                            title: "Topic 2",
                            summary: "Topic 2 summary",
                            minutes: 20,
                            learningGoals: ["Goal 2"],
                        },
                    ],
                },
            ],
        },
    ];

    return {
        blueprint: {
            subjectSlug: "python-v2",
            catalogSlug: "python",
            profileId: "python",
            sourceLocale: "en",
            targetLocales: [],
            title: "Python V2",
            ...overrides?.blueprint,
        },
        plan: {
            subjectSlug: "python-v2",
            profileId: "python",
            modules,
        },
        shape: {
            subjectManifest: {
                genKey: "python_part1",
                accessPolicyDefault: "free",
                statusDefault: "active",
                completionPolicy: {
                    requireAllPublishedModules: true,
                },
                moduleSlug: (index: number) => `python-v2-${index}`,
                keyPatterns: {
                    subjectTitleKey: (subjectSlug: string) => `subjects.${subjectSlug}.title`,
                    subjectDescriptionKey: (subjectSlug: string) =>
                        `subjects.${subjectSlug}.description`,
                    subjectMoreComingKey: (subjectSlug: string) =>
                        `subjects.${subjectSlug}.moreComingSoon`,
                    moduleTitleKey: (subjectSlug: string, moduleSlug: string) =>
                        `modules.${subjectSlug}.${moduleSlug}.title`,
                    moduleDescriptionKey: (subjectSlug: string, moduleSlug: string) =>
                        `modules.${subjectSlug}.${moduleSlug}.description`,
                    moduleOutcomeKey: (subjectSlug: string, moduleSlug: string, i: number) =>
                        `modules.${subjectSlug}.${moduleSlug}.outcomes.${i}`,
                    moduleWhyKey: (subjectSlug: string, moduleSlug: string, i: number) =>
                        `modules.${subjectSlug}.${moduleSlug}.why.${i}`,
                    sectionTitleKey: (
                        subjectSlug: string,
                        moduleSlug: string,
                        sectionSlug: string,
                    ) => `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.title`,
                    sectionDescriptionKey: (
                        subjectSlug: string,
                        moduleSlug: string,
                        sectionSlug: string,
                    ) => `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.description`,
                    sectionWeeksKey: (
                        subjectSlug: string,
                        moduleSlug: string,
                        sectionSlug: string,
                    ) => `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.weeks`,
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

describe("buildSubjectManifestFromPlan", () => {

    it("uses courseNumber for subject manifest order instead of catalog-specific hardcoding", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    subjectSlug: "sql-v2",
                    catalogSlug: "sql",
                    courseNumber: 2,
                },
            }),
        );

        expect(manifest.subject.order).toBe(2);
    });

    it("uses zero as the neutral subject manifest order when no courseNumber is provided", () => {
        const manifest = buildSubjectManifestFromPlan(makeArgs());

        expect(manifest.subject.order).toBe(0);
    });
    it("does not invent default versioning for independent courses", () => {
        const manifest = buildSubjectManifestFromPlan(makeArgs());

        expect(manifest.subject.meta?.versioning).toBeUndefined();
    });

    it("emits versioning only when the blueprint explicitly declares it", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    versioning: {
                        family: "python",
                        version: 2,
                        status: "active",
                        defaultForNewEnrollments: true,
                        supersedes: "python",
                        supersededBy: null,
                    },
                },
            }),
        );

        expect(manifest.subject.meta?.versioning).toEqual({
            family: "python",
            version: 2,
            status: "active",
            defaultForNewEnrollments: true,
            supersedes: "python",
            supersededBy: null,
        });
    });

    it("preserves private course visibility in the generated manifest", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    visibility: "private",
                },
            }),
        );

        expect(manifest.subject.visibility).toBe("private");
    });

    it("does not hardcode the first modules as free", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    accessPolicy: "paid",
                },
            }),
        );

        expect(manifest.subject.accessPolicy).toBe("paid");
        expect(manifest.modules.map((module) => module.accessOverride)).toEqual([null, null]);
    });

    it("preserves explicit module accessOverride paid", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                modules: [
                    {
                        ...makeArgs().plan.modules[0],
                        accessOverride: "paid",
                    },
                    makeArgs().plan.modules[1],
                ],
            }),
        );

        expect(manifest.modules[0]?.accessOverride).toBe("paid");
    });

    it("preserves explicit module accessOverride free", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    moduleAccessOverrideDefault: "paid",
                },
                modules: [
                    {
                        ...makeArgs().plan.modules[0],
                        accessOverride: "free",
                    },
                    makeArgs().plan.modules[1],
                ],
            }),
        );

        expect(manifest.modules[0]?.accessOverride).toBe("free");
        expect(manifest.modules[1]?.accessOverride).toBe("paid");
    });

    it("lets modules inherit the subject access policy when no module override is configured", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    accessPolicy: "paid",
                },
            }),
        );

        expect(manifest.subject.accessPolicy).toBe("paid");
        expect(manifest.modules[0]?.accessOverride).toBeNull();
        expect(manifest.modules[1]?.accessOverride).toBeNull();
    });

    it("emits paid module access when the course default config says paid", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    moduleAccessOverrideDefault: "paid",
                },
            }),
        );

        expect(manifest.modules.map((module) => module.accessOverride)).toEqual(["paid", "paid"]);
    });

    it("preserves explicit week values and leaves missing weeks as null", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                modules: [
                    {
                        ...makeArgs().plan.modules[0],
                        weekStart: 3,
                        weekEnd: 4,
                    },
                    makeArgs().plan.modules[1],
                ],
            }),
        );

        expect(manifest.modules[0]).toMatchObject({
            weekStart: 3,
            weekEnd: 4,
        });
        expect(manifest.modules[1]).toMatchObject({
            weekStart: null,
            weekEnd: null,
        });
    });

    it("emits authored module and section roles into the subject manifest", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                modules: [
                    {
                        ...makeArgs().plan.modules[0],
                        role: "capstone",
                        sections: [
                            {
                                ...makeArgs().plan.modules[0].sections[0],
                                role: "capstone",
                            },
                        ],
                    },
                ],
            }),
        );

        expect(manifest.modules[0]?.role).toBe("capstone");
        expect(manifest.modules[0]?.sections[0]?.role).toBe("capstone");
    });

    it("uses the Git profile for editor, explorer, terminal, and hidden Git bootstrap defaults", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    subjectSlug: "git-foundations",
                    catalogSlug: "git",
                    profileId: "git",
                },
            }),
        );

        const expected = {
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "default",
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/*"],
            },
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        };

        expect(manifest.modules[0]?.serviceDefaults).toMatchObject(expected);
        expect(manifest.modules[0]?.sections[0]?.serviceDefaults).toMatchObject(expected);
    });

    it("keeps Linux on the terminal-only profile layout", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    subjectSlug: "linux-terminal-fundamentals",
                    catalogSlug: "linux",
                    profileId: "bash",
                },
            }),
        );

        expect(manifest.modules[0]?.serviceDefaults).toMatchObject({
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        });
    });


    it("uses profile runner defaults as the lowest-priority Tools scope", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    subjectSlug: "git-foundations",
                    catalogSlug: "git",
                    profileId: "git",
                    tools: {
                        defaultSurface: "editor",
                        runnerPane: { compactDefaultTab: "output" },
                    },
                },
            }),
        );

        expect(manifest.subject.tools).toEqual({
            defaultSurface: "editor",
            compactDefaultSurface: "results",
            runnerPane: {
                defaultTab: "terminal",
                compactDefaultTab: "output",
            },
        });
        expect(manifest.modules[0]?.tools).toEqual(manifest.subject.tools);
        expect(manifest.modules[0]?.sections[0]?.tools).toEqual(
            manifest.subject.tools,
        );
    });

    it("lets explicit authored IDE policy override the profile presentation", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    subjectSlug: "git-foundations",
                    catalogSlug: "git",
                    profileId: "git",
                    idePolicy: {
                        defaultServices: {
                            layoutMode: "terminal_workspace",
                        },
                    },
                },
            }),
        );

        expect(manifest.modules[0]?.serviceDefaults).toMatchObject({
            layoutMode: "terminal_workspace",
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/*"],
            },
        });
    });

    it("enables filesystem and multifile only for the module with a file-runner workspace policy", () => {
        const manifest = buildSubjectManifestFromPlan(
            makeArgs({
                blueprint: {
                    modulePolicies: [
                        {
                            moduleNumber: 7,
                            workspaceProfileId: "browser-python-files-runner",
                        },
                    ],
                },
                modules: [
                    {
                        ...makeArgs().plan.modules[0],
                        order: 6,
                    },
                    {
                        ...makeArgs().plan.modules[1],
                        order: 7,
                    },
                    {
                        ...makeArgs().plan.modules[1],
                        moduleSlug: "python-v2-2",
                        prefix: "py2",
                        order: 8,
                        title: "Module 2",
                    },
                ],
            }),
        );

        expect(manifest.modules[0]?.runtimeDefaults).toMatchObject({
            kind: "code",
            language: "python",
            supportsMultiFile: false,
            supportsFileSystem: false,
            supportsTerminal: false,
            supportsStdInStdOut: true,
            supportsPackageInstall: false,
        });
        expect(manifest.modules[1]?.runtimeDefaults).toMatchObject({
            kind: "code",
            language: "python",
            supportsMultiFile: false,
            supportsFileSystem: false,
        });
        expect(manifest.modules[2]?.runtimeDefaults).toMatchObject({
            kind: "code",
            language: "python",
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsTerminal: false,
            supportsStdInStdOut: true,
            supportsPackageInstall: false,
        });
    });

    it("does not contain the old free-module heuristic in compiler source", async () => {
        const source = await fs.readFile(
            new URL("./buildSubjectManifestFromPlan.ts", import.meta.url),
            "utf8",
        );

        expect(source).not.toContain('module.order <= 2 ? "free" : null');
        expect(source).not.toContain('blueprint.subjectSlug === "sql"');
    });
});
