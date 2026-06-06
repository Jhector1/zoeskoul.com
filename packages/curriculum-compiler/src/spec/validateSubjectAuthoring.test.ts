import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateSubjectAuthoring } from "./validateSubjectAuthoring.js";
import { getAuthoringRoot } from "@zoeskoul/curriculum-core";

async function writeJson(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeAuthoringFixture(overrides: {
    subjectPlan?: Record<string, unknown>;
    catalog?: Record<string, unknown>;
    workspacePolicy?: Record<string, unknown>;
    courseSpec?: Record<string, unknown>;
    coursePlan?: Record<string, unknown>;
    authoringIndex?: Record<string, unknown>;
    omitCourseSpec?: boolean;
    omitCoursePlan?: boolean;
} = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "curriculum-authoring-"));
    const authoringRoot = path.join(root, "authoring");
    const subjectRoot = path.join(authoringRoot, "subjects", "sql");
    const courseRoot = path.join(subjectRoot, "courses", "sql-foundations");

    await writeJson(path.join(subjectRoot, "subject.blueprint.json"), {
        subjectSlug: "sql",
        profileId: "sql",
    });
    await writeJson(path.join(subjectRoot, "subject.validation.json"), {
        subjectSlug: "sql",
    });
    await writeJson(path.join(subjectRoot, "shared", "profile.json"), {
        profileId: "sql",
        language: "sql",
        workspaceProfileId: "browser-sql-runner",
        workspacePolicyId: "sql-browser-workspace",
    });
    await writeJson(path.join(subjectRoot, "shared", "workspace.policy.json"), {
        policyId: "sql-browser-workspace",
        workspaceProfileId: "browser-sql-runner",
        workspacePolicyId: "sql-browser-workspace",
        uiTerms: {
            editor: "SQL editor",
            runButton: "Run query",
            output: "results table",
        },
        preferredTerms: {
            terminal: "SQL editor",
        },
        forbiddenActions: ["terminal", "sqlite3", ".sql"],
        ...overrides.workspacePolicy,
    });
    await writeJson(path.join(subjectRoot, "shared", "datasets.json"), { datasets: {} });
    await writeJson(path.join(authoringRoot, "catalogs", "sql.catalog.json"), {
        catalog: {
            slug: "sql",
            title: "SQL",
            defaultSubjectSlug: "sql",
            subjectSlugs: ["sql"],
            status: "active",
            ...overrides.catalog,
        },
    });
    await writeJson(path.join(authoringRoot, "authoring.index.json"), {
        version: 2,
        layout: "subject-course",
        roots: {
            catalogs: "catalogs",
            subjects: "subjects",
            shared: "shared",
        },
        subjects: [
            {
                subjectSlug: "sql",
                path: "subjects/sql",
                courseOrder: ["sql-foundations"],
                courses: [
                    {
                        courseSlug: "sql-foundations",
                        path: "subjects/sql/courses/sql-foundations/course.spec.json",
                    },
                ],
            },
        ],
        ...overrides.authoringIndex,
    });
    await writeJson(path.join(subjectRoot, "subject.plan.json"), {
        subjectSlug: "sql",
        catalogSlug: "sql",
        profileId: "sql",
        courseOrder: ["sql-foundations"],
        publishTarget: {
            liveSubjectSlug: "sql",
            courseSlug: "sql-foundations",
            channel: "current",
        },
        versioning: {
            family: "sql",
            version: 1,
            status: "active",
            defaultForNewEnrollments: true,
            supersedes: null,
            supersededBy: null,
        },
        ...overrides.subjectPlan,
    });
    if (!overrides.omitCoursePlan) {
        await writeJson(path.join(courseRoot, "course.plan.json"), {
            subjectSlug: "sql",
            courseSlug: "sql-foundations",
            catalogSlug: "sql",
            profileId: "sql",
            title: "SQL Foundations",
            moduleOrder: ["intro"],
            modules: [
                {
                    moduleSlug: "intro",
                    moduleNumber: 1,
                    title: "Intro",
                },
            ],
            ...overrides.coursePlan,
        });
    }

    if (!overrides.omitCourseSpec) {
        await writeJson(path.join(courseRoot, "course.spec.json"), {
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            courseSlug: "sql-foundations",
            catalogSlug: "sql",
            profileId: "sql",
            title: "SQL Foundations",
            description: "Learn SQL basics.",
            sourceLocale: "en",
            targetLocales: [],
            releasePlan: {
                currentRelease: {
                    name: "fixture",
                    startModuleNumber: 1,
                    endModuleNumber: 1,
                },
                releases: [
                    {
                        name: "fixture",
                        startModuleNumber: 1,
                        endModuleNumber: 1,
                    },
                ],
            },
            policy: {
                qualityPolicy: {
                    requireModuleProject: false,
                },
            },
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "intro",
                    title: "Intro",
                    sections: [
                        {
                            sectionSlug: "basics",
                            title: "Basics",
                            topics: [
                                {
                                    topicId: "select_basics",
                                    title: "Select Basics",
                                },
                            ],
                        },
                    ],
                },
            ],
            ...overrides.courseSpec,
        });
    }

    return authoringRoot;
}

describe("validateSubjectAuthoring", () => {
    it("validates every subject in the refactored authoring layout", async () => {
        const subjectsRoot = path.join(getAuthoringRoot(), "subjects");
        const subjectSlugs = (await fs.readdir(subjectsRoot, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        const issuesBySubject: Record<string, string[]> = {};

        for (const subjectSlug of subjectSlugs) {
            const issues = await validateSubjectAuthoring(subjectSlug);
            if (issues.length) {
                issuesBySubject[subjectSlug] = issues;
            }
        }

        expect(subjectSlugs).toEqual(expect.arrayContaining(["python", "sql"]));
        expect(issuesBySubject).toEqual({});
    });

    it("fails when publishTarget course is missing", async () => {
        const authoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql",
                    courseSlug: "missing-course",
                    channel: "current",
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'publishTarget.courseSlug "missing-course" must be listed in courseOrder',
                ),
            ]),
        );
    });

    it("fails when course.plan.json is missing", async () => {
        const authoringRoot = await makeAuthoringFixture({
            omitCoursePlan: true,
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    "course.plan.json: course.plan.json is required",
                ),
            ]),
        );
    });

    it("fails when course.spec courseSlug does not match folder", async () => {
        const authoringRoot = await makeAuthoringFixture({
            courseSpec: {
                courseSlug: "wrong-course",
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'courseSlug must be "sql-foundations" but found "wrong-course"',
                ),
            ]),
        );
    });

    it("fails when publishTarget.channel is current and versioning.status is legacy", async () => {
        const authoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                versioning: {
                    family: "sql",
                    version: 1,
                    status: "legacy",
                    defaultForNewEnrollments: false,
                    supersededBy: "sql-v2",
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'publishTarget.channel "current" requires versioning.status "active"',
                ),
                expect.stringContaining(
                    'versioning.status "legacy" cannot be used with publishTarget.channel "current"',
                ),
            ]),
        );
    });

    it("fails when publishTarget.channel is current and defaultForNewEnrollments is false or missing", async () => {
        const missingDefaultAuthoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    supersedes: "sql-v1",
                    supersededBy: null,
                },
            },
        });
        const falseDefaultAuthoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: false,
                    supersedes: "sql-v1",
                    supersededBy: null,
                },
            },
        });

        await expect(
            validateSubjectAuthoring("sql", { authoringRoot: missingDefaultAuthoringRoot }),
        ).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'publishTarget.channel "current" requires versioning.defaultForNewEnrollments true',
                ),
            ]),
        );
        await expect(
            validateSubjectAuthoring("sql", { authoringRoot: falseDefaultAuthoringRoot }),
        ).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'publishTarget.channel "current" requires versioning.defaultForNewEnrollments true',
                ),
            ]),
        );
    });

    it("fails when publishTarget.channel is current and supersededBy is non-null", async () => {
        const authoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql-v1",
                    supersededBy: "sql-v3",
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'publishTarget.channel "current" cannot have versioning.supersededBy',
                ),
            ]),
        );
    });

    it("fails when versioning.status is legacy and defaultForNewEnrollments is true", async () => {
        const authoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-preview",
                    courseSlug: "sql-foundations",
                    channel: "preview",
                },
                versioning: {
                    family: "sql",
                    version: 1,
                    status: "legacy",
                    defaultForNewEnrollments: true,
                    supersededBy: "sql-v2",
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining("legacy versions cannot be defaultForNewEnrollments"),
                expect.stringContaining(
                    'defaultForNewEnrollments true requires versioning.status "active"',
                ),
            ]),
        );
    });

    it("fails when defaultForNewEnrollments is true but versioning.status is not active", async () => {
        const authoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-preview",
                    courseSlug: "sql-foundations",
                    channel: "preview",
                },
                versioning: {
                    family: "sql",
                    version: 3,
                    status: "draft",
                    defaultForNewEnrollments: true,
                    supersedes: "sql-v2",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'defaultForNewEnrollments true requires versioning.status "active"',
                ),
            ]),
        );
    });

    it("passes for a valid active current release", async () => {
        const authoringRoot = await makeAuthoringFixture({
            catalog: {
                defaultSubjectSlug: "sql-v2",
                subjectSlugs: ["sql", "sql-v2"],
            },
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-v2",
                    courseSlug: "sql-foundations",
                    channel: "current",
                },
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual([]);
    });

    it("passes for a valid legacy non-current release", async () => {
        const authoringRoot = await makeAuthoringFixture({
            catalog: {
                defaultSubjectSlug: "sql-v2",
                subjectSlugs: ["sql", "sql-v2"],
            },
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql",
                    courseSlug: "sql-foundations",
                    channel: "draft",
                },
                versioning: {
                    family: "sql",
                    version: 1,
                    status: "legacy",
                    defaultForNewEnrollments: false,
                    supersededBy: "some-new-version",
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual([]);
    });

    it("fails when a v2 current release publishes into the superseded SQL slug", async () => {
        const authoringRoot = await makeAuthoringFixture({
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql",
                    courseSlug: "sql-foundations",
                    channel: "current",
                },
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'current active version 2 cannot publish into superseded liveSubjectSlug "sql"',
                ),
                expect.stringContaining(
                    'SQL version 2 with supersedes "sql" must publish into liveSubjectSlug "sql-v2"',
                ),
            ]),
        );
    });

    it("fails when SQL version 2 uses liveSubjectSlug other than sql-v2", async () => {
        const authoringRoot = await makeAuthoringFixture({
            catalog: {
                defaultSubjectSlug: "sql-preview",
                subjectSlugs: ["sql", "sql-preview"],
            },
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-preview",
                    courseSlug: "sql-foundations",
                    channel: "current",
                },
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'SQL version 2 with supersedes "sql" must publish into liveSubjectSlug "sql-v2"',
                ),
            ]),
        );
    });

    it("fails when catalog.subjectSlugs omits the superseded SQL slug", async () => {
        const authoringRoot = await makeAuthoringFixture({
            catalog: {
                defaultSubjectSlug: "sql-v2",
                subjectSlugs: ["sql-v2"],
            },
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-v2",
                    courseSlug: "sql-foundations",
                    channel: "current",
                },
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'catalog.subjectSlugs must include versioning.supersedes "sql"',
                ),
            ]),
        );
    });

    it("fails when catalog.subjectSlugs omits the publish target live subject", async () => {
        const authoringRoot = await makeAuthoringFixture({
            catalog: {
                defaultSubjectSlug: "sql",
                subjectSlugs: ["sql"],
            },
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-v2",
                    courseSlug: "sql-foundations",
                    channel: "current",
                },
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'catalog.subjectSlugs must include publishTarget.liveSubjectSlug "sql-v2"',
                ),
            ]),
        );
    });

    it("fails when catalog.defaultSubjectSlug is not the active current publish target", async () => {
        const authoringRoot = await makeAuthoringFixture({
            catalog: {
                defaultSubjectSlug: "sql",
                subjectSlugs: ["sql", "sql-v2"],
            },
            subjectPlan: {
                publishTarget: {
                    liveSubjectSlug: "sql-v2",
                    courseSlug: "sql-foundations",
                    channel: "current",
                },
                versioning: {
                    family: "sql",
                    version: 2,
                    status: "active",
                    defaultForNewEnrollments: true,
                    supersedes: "sql",
                    supersededBy: null,
                },
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'catalog.defaultSubjectSlug must equal publishTarget.liveSubjectSlug "sql-v2"',
                ),
            ]),
        );
    });

    it("passes for SQL refactored authoring", async () => {
        const authoringRoot = await makeAuthoringFixture();

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual([]);
    });

    it("fails when course.plan moduleOrder does not match course.spec modules", async () => {
        const authoringRoot = await makeAuthoringFixture({
            coursePlan: {
                moduleOrder: ["old-intro"],
                modules: [
                    {
                        moduleSlug: "old-intro",
                        moduleNumber: 1,
                        title: "Intro",
                    },
                ],
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    "course.plan.json: moduleOrder must exactly match course.spec.json modules[].moduleSlug",
                ),
                expect.stringContaining(
                    "course.plan.json: modules[].moduleSlug must exactly match course.spec.json modules[].moduleSlug",
                ),
            ]),
        );
    });

    it("fails when authoring.index references an inactive course", async () => {
        const authoringRoot = await makeAuthoringFixture({
            authoringIndex: {
                subjects: [
                    {
                        subjectSlug: "sql",
                        path: "subjects/sql",
                        courseOrder: ["sql-foundations"],
                        courses: [
                            {
                                courseSlug: "sql-foundations",
                                path: "subjects/sql/courses/sql-foundations/course.spec.json",
                            },
                            {
                                courseSlug: "legacy-sql",
                                path: "subjects/sql/courses/legacy-sql/course.spec.json",
                            },
                        ],
                    },
                ],
            },
        });

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'authoring.index.json: subject "sql" references inactive course "legacy-sql"',
                ),
            ]),
        );
    });

    it("fails when an unexpected active course folder remains under subjects/<subject>/courses", async () => {
        const authoringRoot = await makeAuthoringFixture();
        await writeJson(
            path.join(
                authoringRoot,
                "subjects",
                "sql",
                "courses",
                "legacy-sql",
                "course.spec.json",
            ),
            {
                authoringFormatVersion: "2.0",
                subjectSlug: "sql",
                courseSlug: "legacy-sql",
                catalogSlug: "sql",
                profileId: "sql",
                title: "Legacy SQL",
                sourceLocale: "en",
                targetLocales: [],
                releasePlan: {
                    currentRelease: {
                        name: "fixture",
                        startModuleNumber: 1,
                        endModuleNumber: 1,
                    },
                    releases: [
                        {
                            name: "fixture",
                            startModuleNumber: 1,
                            endModuleNumber: 1,
                        },
                    ],
                },
                policy: {
                    qualityPolicy: {
                        requireModuleProject: false,
                    },
                },
                modules: [
                    {
                        moduleNumber: 1,
                        moduleSlug: "legacy-intro",
                        title: "Legacy Intro",
                        sections: [
                            {
                                sectionSlug: "legacy-basics",
                                title: "Legacy Basics",
                                topics: [
                                    {
                                        topicId: "legacy_topic",
                                        title: "Legacy Topic",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        );

        await expect(validateSubjectAuthoring("sql", { authoringRoot })).resolves.toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'unexpected active course folder "legacy-sql" is not listed in subject.plan.json or authoring.index.json',
                ),
            ]),
        );
    });
});
