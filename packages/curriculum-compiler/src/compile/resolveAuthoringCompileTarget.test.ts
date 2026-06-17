import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getSubjectShape } from "@zoeskoul/curriculum-profiles";
import { getRepoRoot } from "@zoeskoul/curriculum-core";
import { buildPlanFromSpec } from "../spec/buildPlanFromSpec.js";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import {
    resolveAuthoringCompileTarget,
    resolveSubjectPublishTarget,
} from "./resolveAuthoringCompileTarget.js";

describe("authoring compile target resolution", () => {
    it("compileSubject uses subject.plan publishTarget courseSlug for SQL", async () => {
        const target = await resolveSubjectPublishTarget("sql");

        expect(target.courseSlug).toBe("sql-foundations");
        expect(target.liveSubjectSlug).toBe("sql-v2");
        expect(target.spec.courseSlug).toBe("sql-foundations");
        expect(target.blueprint.subjectSlug).toBe("sql-v2");
    });

    it("compileSubject writes to liveSubjectSlug when it differs from authoring subject", async () => {
        const target = await resolveSubjectPublishTarget("python");
        const manifest = JSON.parse(
            fs.readFileSync(
                path.join(
                    getRepoRoot(),
                    "apps/web/src/lib/subjects",
                    target.liveSubjectSlug,
                    "subject.manifest.json",
                ),
                "utf8",
            ),
        );

        expect(target.authoringSubjectSlug).toBe("python");
        expect(target.courseSlug).toBe("python-v2");
        expect(target.liveSubjectSlug).toBe("python-v2");
        expect(target.blueprint.subjectSlug).toBe("python-v2");
        expect(manifest.subject.slug).toBe("python-v2");
    });


    it("copies courseNumber from course.spec.json into the live blueprint", async () => {
        const target = await resolveSubjectPublishTarget("python");

        expect(target.blueprint.courseNumber).toBe(target.spec.courseNumber);
    });

    it("compileSubject compiles only the selected publishTarget course", async () => {
        const target = await resolveSubjectPublishTarget("python");

        expect(target.subjectPlan.courseOrder).toEqual(
            expect.arrayContaining([
                "python-v2",
                "python-data-functions",
                "applied-python-projects",
            ]),
        );
        expect(target.spec.courseSlug).toBe("python-v2");

    });

    it("compileCourse refuses to publish non-target course without explicit liveSubjectSlug", async () => {
        await expect(
            resolveAuthoringCompileTarget({
                subjectSlug: "python",
                courseSlug: "python-data-functions",
            }),
        ).rejects.toThrow(/not the publishTarget/);
    });

    it("compileCourse refuses non-target course into production liveSubjectSlug without force", async () => {
        await expect(
            resolveAuthoringCompileTarget({
                subjectSlug: "python",
                courseSlug: "python-data-functions",
                options: {
                    liveSubjectSlug: "python-v2",
                },
            }),
        ).rejects.toThrow(/--force-live-overwrite/);
    });

    it("compileCourse allows a non-target course with a different preview liveSubjectSlug", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                liveSubjectSlug: "python-preview",
            },
        });

        expect(target.liveSubjectSlug).toBe("python-preview");
        expect(target.blueprint.subjectSlug).toBe("python-preview");
    });

    it("does not inherit publish-target versioning into non-target Python courses", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "python",
            courseSlug: "applied-python-projects",
            options: {
                liveSubjectSlug: "applied-python-projects",
            },
        });

        expect(target.blueprint.subjectSlug).toBe("applied-python-projects");
        expect(target.blueprint.versioning).toBeUndefined();
    });

    it("compileCourse allows a non-target course in draft-only mode without a live subject slug", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                draftOnly: true,
            },
        });

        expect(target.liveSubjectSlug).toBe("python--python-data-functions--draft");
        expect(target.blueprint.subjectSlug).toBe("python--python-data-functions--draft");
        expect(target.publishToLive).toBe(false);
    });

    it("emits file-enabled runtime defaults only for python-data-functions module 7", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                draftOnly: true,
            },
        });
        const plan = buildPlanFromSpec({
            blueprint: target.blueprint,
            spec: target.spec,
        });
        const manifest = buildSubjectManifestFromPlan({
            blueprint: target.blueprint,
            plan,
            shape: getSubjectShape("python"),
        });

        const module5 = manifest.modules.find(
            (module) => module.slug === "python-5-lists-tuples-and-dictionaries",
        );
        const module6 = manifest.modules.find(
            (module) => module.slug === "python-6-functions-and-modularity",
        );
        const module7 = manifest.modules.find(
            (module) => module.slug === "python-7-files-exceptions-and-data-cleaning",
        );

        expect(module5?.runtimeDefaults).toMatchObject({
            supportsMultiFile: false,
            supportsFileSystem: false,
        });
        expect(module6?.runtimeDefaults).toMatchObject({
            supportsMultiFile: false,
            supportsFileSystem: false,
        });
        expect(module7?.runtimeDefaults).toMatchObject({
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsTerminal: false,
            supportsPackageInstall: false,
        });
    });

    it("compileCourse allows forced overwrite only when forceLiveOverwrite is explicitly passed", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            options: {
                liveSubjectSlug: "python-v2",
                forceLiveOverwrite: true,
            },
        });

        expect(target.liveSubjectSlug).toBe("python-v2");
        expect(target.blueprint.subjectSlug).toBe("python-v2");
    });

    it("preserves subject.plan versioning in the generated manifest shape", async () => {
        const target = await resolveSubjectPublishTarget("python");
        const plan = buildPlanFromSpec({
            blueprint: target.blueprint,
            spec: target.spec,
        });
        const manifest = buildSubjectManifestFromPlan({
            blueprint: target.blueprint,
            plan,
            shape: getSubjectShape("python"),
        });

        expect(manifest.subject.slug).toBe("python-v2");
        expect(manifest.subject.meta?.versioning).toEqual({
            family: "python",
            version: 2,
            status: "active",
            defaultForNewEnrollments: true,
            supersedes: "python",
            supersededBy: null,
        });
    });

    it("keeps SQL version family and enrollment default stable", async () => {
        const target = await resolveSubjectPublishTarget("sql");
        const plan = buildPlanFromSpec({
            blueprint: target.blueprint,
            spec: target.spec,
        });
        const manifest = buildSubjectManifestFromPlan({
            blueprint: target.blueprint,
            plan,
            shape: getSubjectShape("sql"),
        });

        expect(manifest.subject.slug).toBe("sql-v2");
        expect(manifest.subject.profileId).toBe("sql");
        expect(manifest.subject.meta?.versioning?.family).toBe("sql");
        expect(manifest.subject.meta?.versioning?.version).toBe(2);
        expect(manifest.subject.meta?.versioning?.status).toBe("active");
        expect(manifest.subject.meta?.versioning?.defaultForNewEnrollments).toBe(true);
        expect(manifest.subject.meta?.versioning?.supersedes).toBe("sql");
        expect(manifest.modules[0]?.runtimeDefaults).toMatchObject({
            kind: "sql",
            datasetId: expect.any(String),
        });
    });
});
