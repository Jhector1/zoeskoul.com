import { describe, expect, it } from "vitest";
// @ts-ignore test-only import from the repo script wrapper
const curriculumCourseLib = await import("../../../../scripts/curriculum-course-lib.mjs");
const { buildCheckCliPlan, buildPublishCliPlan } = curriculumCourseLib as {
    buildCheckCliPlan: (args: {
        subjectSlug: string;
        courseSlug: string;
        resume?: boolean;
        liveSubjectSlug?: string;
        forceLiveOverwrite?: boolean;
        hasCourseBlueprint?: boolean;
        courseBlueprintPath?: string;
    }) => string[][];
    buildPublishCliPlan: (args: {
        subjectSlug: string;
        courseSlug: string;
        liveSubjectSlug?: string;
        force?: boolean;
        forceLiveOverwrite?: boolean;
    }) => string[][];
};

const courseBlueprintPath =
    "/Users/admin/Documents/NextJSProject/zoeskoul.com/authoring/subjects/python/courses/python-data-functions/course.blueprint.json";

describe("curriculum-course workflow plans", () => {
    it("buildCheckCliPlan does not include --live-subject by default", () => {
        const plan = buildCheckCliPlan({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            resume: false,
            liveSubjectSlug: undefined,
            forceLiveOverwrite: false,
            hasCourseBlueprint: false,
            courseBlueprintPath,
        });

        expect(plan.flat()).not.toContain("--live-subject");
    });

    it("buildCheckCliPlan does not include generated --draft slugs", () => {
        const plan = buildCheckCliPlan({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            resume: false,
            liveSubjectSlug: undefined,
            forceLiveOverwrite: false,
            hasCourseBlueprint: false,
            courseBlueprintPath,
        });

        expect(
            plan.flat().some((part: string) => String(part).endsWith("--draft")),
        ).toBe(false);
    });

    it("buildCheckCliPlan compiles draft-only and remains the only compile path", () => {
        const checkPlan = buildCheckCliPlan({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            resume: true,
            liveSubjectSlug: undefined,
            forceLiveOverwrite: false,
            hasCourseBlueprint: true,
            courseBlueprintPath,
        });
        const publishPlan = buildPublishCliPlan({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            liveSubjectSlug: undefined,
            force: false,
            forceLiveOverwrite: false,
        });

        expect(checkPlan).toContainEqual([
            "compile-course",
            "python",
            "python-data-functions",
            "--draft-only",
            "--resume",
        ]);
        expect(checkPlan.flat()).toContain("compile-course");
        expect(publishPlan.flat()).not.toContain("compile-course");
    });

    it("buildPublishCliPlan publishes only the requested course", () => {
        const plan = buildPublishCliPlan({
            subjectSlug: "python",
            courseSlug: "python-data-functions",
            liveSubjectSlug: undefined,
            force: true,
            forceLiveOverwrite: false,
        });

        expect(plan).toContainEqual([
            "publish-course",
            "python",
            "python-data-functions",
            "--force",
        ]);
        expect(plan.flat()).not.toContain("publish-subject");
    });
});
