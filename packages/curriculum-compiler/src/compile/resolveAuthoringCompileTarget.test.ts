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
        expect(target.courseSlug).toBe("python-for-beginners");
        expect(target.liveSubjectSlug).toBe("python-v2");
        expect(target.blueprint.subjectSlug).toBe("python-v2");
        expect(manifest.subject.slug).toBe("python-v2");
    });

    it("compileSubject compiles only the selected publishTarget course", async () => {
        const target = await resolveSubjectPublishTarget("python");

        expect(target.subjectPlan.courseOrder).toEqual(
            expect.arrayContaining([
                "python-for-beginners",
                "python-data-functions",
                "applied-python-projects",
            ]),
        );
        expect(target.spec.courseSlug).toBe("python-for-beginners");
    });

    it("compileCourse refuses to publish non-target course without explicit liveSubjectSlug", async () => {
        await expect(
            resolveAuthoringCompileTarget({
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
            }),
        ).rejects.toThrow(/not the publishTarget/);
    });

    it("compileCourse refuses non-target course into production liveSubjectSlug without force", async () => {
        await expect(
            resolveAuthoringCompileTarget({
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                options: {
                    liveSubjectSlug: "sql-v2",
                },
            }),
        ).rejects.toThrow(/--force-live-overwrite/);
    });

    it("compileCourse allows a non-target course with a different preview liveSubjectSlug", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "sql",
            courseSlug: "multi-table-sql",
            options: {
                liveSubjectSlug: "sql-preview",
            },
        });

        expect(target.liveSubjectSlug).toBe("sql-preview");
        expect(target.blueprint.subjectSlug).toBe("sql-preview");
    });

    it("compileCourse allows forced overwrite only when forceLiveOverwrite is explicitly passed", async () => {
        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                options: {
                    liveSubjectSlug: "sql-v2",
                    forceLiveOverwrite: true,
                },
            });

        expect(target.liveSubjectSlug).toBe("sql-v2");
        expect(target.blueprint.subjectSlug).toBe("sql-v2");
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
        expect(manifest.subject.meta?.versioning?.family).toBe("sql");
        expect(manifest.subject.meta?.versioning?.version).toBe(2);
        expect(manifest.subject.meta?.versioning?.status).toBe("active");
        expect(manifest.subject.meta?.versioning?.defaultForNewEnrollments).toBe(true);
        expect(manifest.subject.meta?.versioning?.supersedes).toBe("sql");
    });
});
