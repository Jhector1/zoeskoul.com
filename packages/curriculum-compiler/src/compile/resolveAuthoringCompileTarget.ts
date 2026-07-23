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
    draftOnly?: boolean;
};

type CourseVersioning = NonNullable<CourseBlueprint["versioning"]>;

function buildDraftOnlySubjectSlug(args: {
    subjectSlug: string;
    courseSlug: string;
}) {
    return `${args.subjectSlug}--${args.courseSlug}--draft`;
}

function versioningFingerprint(versioning: CourseVersioning): string {
    return JSON.stringify({
        family: versioning.family,
        version: versioning.version,
        status: versioning.status,
        defaultForNewEnrollments: versioning.defaultForNewEnrollments ?? null,
        supersedes: versioning.supersedes ?? null,
        supersededBy: versioning.supersededBy ?? null,
    });
}

function assertSameVersioning(args: {
    courseSlug: string;
    leftLabel: string;
    left?: CourseVersioning;
    rightLabel: string;
    right?: CourseVersioning;
}) {
    if (!args.left || !args.right) return;

    if (versioningFingerprint(args.left) === versioningFingerprint(args.right)) {
        return;
    }

    throw new Error(
        `Conflicting versioning for course "${args.courseSlug}" between ${args.leftLabel} and ${args.rightLabel}. Keep versioning in one source of truth, or make both definitions identical.`,
    );
}

function getPublishTargetVersioning(args: {
    subjectPlan: SubjectPlan;
    spec: CourseSpec;
    courseSlug: string;
}): CourseVersioning | undefined {
    const planVersioning = args.subjectPlan.versioning as CourseVersioning | undefined;
    const specVersioning = args.spec.versioning as CourseVersioning | undefined;

    assertSameVersioning({
        courseSlug: args.courseSlug,
        leftLabel: "subject.plan.json",
        left: planVersioning,
        rightLabel: "course.spec.json",
        right: specVersioning,
    });

    return planVersioning ?? specVersioning;
}

function resolveCourseVersioning(args: {
    subjectPlan: SubjectPlan;
    spec: CourseSpec;
    courseSlug: string;
}): CourseVersioning | undefined {
    const isPublishTarget =
        args.subjectPlan.publishTarget?.courseSlug === args.spec.courseSlug;

    if (isPublishTarget) {
        return getPublishTargetVersioning(args);
    }

    /**
     * Non-publish-target courses are independent catalog courses unless their own
     * course.spec.json explicitly declares versioning. They must never inherit the
     * subject.plan publish-target version family, because that collapses separate
     * courses such as python-data-functions or applied-python-projects into
     * python-v2 in the catalog.
     */
    return args.spec.versioning as CourseVersioning | undefined;
}

function assertVersioning(args: {
    subjectPlan: SubjectPlan;
    spec: CourseSpec;
    courseSlug: string;
}) {
    const versioning = getPublishTargetVersioning(args);
    if (!versioning?.family || !versioning.version || !versioning.status) {
        throw new Error(
            `Publish target course "${args.courseSlug}" must define compatible versioning in subject.plan.json or course.spec.json`,
        );
    }
}
function cleanText(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveCourseDescription(args: {
    spec: CourseSpec;
    blueprint: CourseBlueprint;
}): string | undefined {
    return (
        cleanText((args.spec as any).description) ??
        cleanText(args.spec.courseOverview?.summary) ??
        cleanText(args.spec.subtitle) ??
        cleanText(args.blueprint.description)
    );
}
function withLiveSubjectIdentity(args: {
    blueprint: CourseBlueprint;
    subjectPlan: SubjectPlan;
    spec: CourseSpec;
    liveSubjectSlug: string;
}): CourseBlueprint {
    const versioning = resolveCourseVersioning({
        subjectPlan: args.subjectPlan,
        spec: args.spec,
        courseSlug: args.spec.courseSlug,
    });

    return {
        ...args.blueprint,
        subjectSlug: args.liveSubjectSlug,
        courseSlug: args.spec.courseSlug,
        catalogSlug:
            args.spec.catalogSlug ??
            args.blueprint.catalogSlug ??
            args.subjectPlan.catalogSlug ??
            args.subjectPlan.subjectSlug,
        accessPolicy:
            args.subjectPlan.accessPolicy ??
            args.spec.accessPolicy ??
            args.blueprint.accessPolicy,
        visibility:
            args.subjectPlan.visibility ??
            args.spec.visibility ??
            args.blueprint.visibility ??
            "public",
        moduleAccessOverrideDefault:
            args.spec.moduleAccessOverrideDefault ??
            args.blueprint.moduleAccessOverrideDefault ??
            null,
        profileId: args.spec.profileId as CourseBlueprint["profileId"],
        sourceLocale: args.spec.sourceLocale as CourseBlueprint["sourceLocale"],
        targetLocales: args.spec.targetLocales as CourseBlueprint["targetLocales"],
        title: args.spec.title || args.blueprint.title,
        courseNumber: args.spec.courseNumber ?? args.blueprint.courseNumber,
        description: resolveCourseDescription({
            spec: args.spec,
            blueprint: args.blueprint,
        }),
        workspaceProfileId: args.spec.workspaceProfileId ?? args.blueprint.workspaceProfileId,
        workspacePolicyId: args.spec.workspacePolicyId ?? args.blueprint.workspacePolicyId,
        workspaceOverrides: args.spec.workspaceOverrides ?? args.blueprint.workspaceOverrides,
        courseGenerationPolicy:
            args.spec.courseGenerationPolicy ?? args.blueprint.courseGenerationPolicy,
        modulePolicies: args.spec.modulePolicies ?? args.blueprint.modulePolicies,
        topicPolicies: args.spec.topicPolicies ?? args.blueprint.topicPolicies,
        versioning,
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
    const liveSubjectSlug =
        args.options?.liveSubjectSlug ??
        (args.options?.draftOnly
            ? buildDraftOnlySubjectSlug({
                subjectSlug: args.subjectSlug,
                courseSlug: args.courseSlug,
            })
            : publishTargetLiveSubjectSlug);

    if (
        !args.options?.draftOnly &&
        !isPublishTarget &&
        !args.options?.liveSubjectSlug
    ) {
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
        publishToLive:
            !args.options?.draftOnly &&
            (isPublishTarget || Boolean(args.options?.liveSubjectSlug)),
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
