import type {
    CourseBlueprint,
    CourseSpec,
    SubjectPlan,
} from "@zoeskoul/curriculum-contracts";
import {
    getAuthoringCourseBlueprintPath,
} from "@zoeskoul/curriculum-core";
import { loadBlueprint } from "../blueprint/loadBlueprint.js";
import { loadCourseSpec, loadSubjectPlan } from "../spec/loadCourseSpec.js";
import {
    assertSubjectAuthoring,
    validateCourseAuthoring,
} from "../spec/validateSubjectAuthoring.js";

export type AuthoringCompileTarget = {
    authoringSubjectSlug: string;
    courseSlug: string;
    liveSubjectSlug: string;
    subjectPlan: SubjectPlan;
    blueprint: CourseBlueprint;
    spec: CourseSpec;
    publishToLive: boolean;
};

type ResolveCourseTargetOptions = {
    liveSubjectSlug?: string;
    forceLiveOverwrite?: boolean;
};

function assertVersioning(args: {
    subjectPlan: SubjectPlan;
    spec: CourseSpec;
    courseSlug: string;
}) {
    const versioning = args.subjectPlan.versioning ?? args.spec.versioning;
    if (!versioning?.family || !versioning.version || !versioning.status) {
        throw new Error(
            `Publish target course "${args.courseSlug}" must define compatible versioning in subject.plan.json or course.spec.json`,
        );
    }
}

function withLiveSubjectIdentity(args: {
    blueprint: CourseBlueprint;
    subjectPlan: SubjectPlan;
    spec: CourseSpec;
    liveSubjectSlug: string;
}): CourseBlueprint {
    const versioning =
        args.subjectPlan.versioning ?? args.spec.versioning ?? args.blueprint.versioning;

    return {
        ...args.blueprint,
        subjectSlug: args.liveSubjectSlug,
        courseSlug: args.spec.courseSlug,
        catalogSlug:
            args.spec.catalogSlug ??
            args.blueprint.catalogSlug ??
            args.subjectPlan.catalogSlug ??
            args.subjectPlan.subjectSlug,
        profileId: args.spec.profileId as CourseBlueprint["profileId"],
        sourceLocale: args.spec.sourceLocale as CourseBlueprint["sourceLocale"],
        targetLocales: args.spec.targetLocales as CourseBlueprint["targetLocales"],
        title: args.spec.title || args.blueprint.title,
        workspaceProfileId: args.spec.workspaceProfileId ?? args.blueprint.workspaceProfileId,
        workspacePolicyId: args.spec.workspacePolicyId ?? args.blueprint.workspacePolicyId,
        versioning: versioning as CourseBlueprint["versioning"],
    };
}

export async function resolveAuthoringCompileTarget(args: {
    subjectSlug: string;
    courseSlug: string;
    options?: ResolveCourseTargetOptions;
}): Promise<AuthoringCompileTarget> {
    const subjectPlan = await loadSubjectPlan(args.subjectSlug);

    if (!subjectPlan) {
        throw new Error(`No subject plan found for ${args.subjectSlug}`);
    }

    const isPublishTarget = subjectPlan.publishTarget?.courseSlug === args.courseSlug;
    const publishTargetLiveSubjectSlug = subjectPlan.publishTarget?.liveSubjectSlug;
    const liveSubjectSlug = args.options?.liveSubjectSlug ?? publishTargetLiveSubjectSlug;

    if (!isPublishTarget && !args.options?.liveSubjectSlug) {
        throw new Error(
            `Course "${args.courseSlug}" is not the publishTarget for subject "${args.subjectSlug}". Pass --live-subject <liveSubjectSlug> to compile it into a live subject slot.`,
        );
    }

    if (
        !isPublishTarget &&
        args.options?.liveSubjectSlug === publishTargetLiveSubjectSlug &&
        !args.options?.forceLiveOverwrite
    ) {
        throw new Error(
            `Course "${args.courseSlug}" is not the publishTarget for subject "${args.subjectSlug}" and cannot overwrite live subject "${publishTargetLiveSubjectSlug}" without --force-live-overwrite.`,
        );
    }

    if (!liveSubjectSlug) {
        throw new Error(
            `Subject plan for "${args.subjectSlug}" is missing publishTarget.liveSubjectSlug`,
        );
    }

    const issues = isPublishTarget
        ? await validateCourseAuthoring(args.subjectSlug, args.courseSlug)
        : await validateCourseAuthoring(args.subjectSlug, args.courseSlug);

    if (issues.length) {
        throw new Error(`Course authoring validation failed:\n- ${issues.join("\n- ")}`);
    }

    const spec = await loadCourseSpec(args.subjectSlug, args.courseSlug);
    if (!spec) {
        throw new Error(
            `No course spec found for ${args.subjectSlug}/${args.courseSlug}`,
        );
    }

    if (isPublishTarget) {
        assertVersioning({
            subjectPlan,
            spec,
            courseSlug: args.courseSlug,
        });
    }

    const authoringBlueprint = await loadBlueprint(
        getAuthoringCourseBlueprintPath(args.subjectSlug, args.courseSlug),
    );

    return {
        authoringSubjectSlug: args.subjectSlug,
        courseSlug: args.courseSlug,
        liveSubjectSlug,
        subjectPlan,
        spec,
        blueprint: withLiveSubjectIdentity({
            blueprint: authoringBlueprint,
            subjectPlan,
            spec,
            liveSubjectSlug,
        }),
        publishToLive: isPublishTarget || Boolean(args.options?.liveSubjectSlug),
    };
}

export async function resolveSubjectPublishTarget(subjectSlug: string) {
    const subjectPlan = await loadSubjectPlan(subjectSlug);
    if (!subjectPlan?.publishTarget?.courseSlug) {
        throw new Error(
            `Subject plan for "${subjectSlug}" is missing publishTarget.courseSlug`,
        );
    }

    await assertSubjectAuthoring(subjectSlug);

    return resolveAuthoringCompileTarget({
        subjectSlug,
        courseSlug: subjectPlan.publishTarget.courseSlug,
    });
}
