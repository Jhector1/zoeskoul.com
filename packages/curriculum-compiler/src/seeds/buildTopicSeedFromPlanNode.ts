import type {
    CourseBlueprint,
    CourseSpec, ManifestRuntimeDefaults,
    PlannedModule,
    PlannedSection,
    PlannedTopic,
} from "@zoeskoul/curriculum-contracts";
import { getProfileAdapter } from "@zoeskoul/curriculum-profiles";
import { resolveExercisePolicy } from "../spec/resolveExercisePolicy.js";
import { planExerciseCounts } from "../policy/planExerciseCounts.js";
import {
    resolveModuleRuntimePolicy,
    runtimePolicyToTopicRuntimeDefaults,
} from "../spec/resolveModuleRuntimePolicy.js";
import {resolveWorkspacePolicy} from "../policy/resolveWorkspacePolicy.js";
import {workspaceToRuntimeDefaults} from "../policy/workspaceToRuntimeDefaults.js";

export function buildTopicSeedFromPlanNode(args: {
    blueprint: CourseBlueprint;
    spec?: CourseSpec | null;
    module: PlannedModule;
    section: PlannedSection;
    topic: PlannedTopic;
}) {
    const adapter = getProfileAdapter(args.blueprint.profileId);

    const exercisePolicy = resolveExercisePolicy({
        blueprint: args.blueprint,
        spec: args.spec ?? null,
        moduleSlug: args.module.moduleSlug,
    });

    const sourceRuntimePolicy = resolveModuleRuntimePolicy({
        blueprint: args.blueprint,
        spec: args.spec ?? null,
        module: {
            moduleSlug: args.module.moduleSlug,
            order: args.module.order,
            runtimePolicy: args.module.runtimePolicy,
        },
    });

    const sourceRuntimeDefaults = runtimePolicyToTopicRuntimeDefaults({
        profileId: args.blueprint.profileId,
        runtimePolicy: sourceRuntimePolicy,
    });

    const adapterRuntimeDefaults =
        adapter.getTopicSeedRuntimeDefaults?.({
            blueprint: args.blueprint,
            module: {
                slug: args.module.moduleSlug,
                order: args.module.order,
            },
        }) ?? null;

    const moduleRuntimeDefaults =
        sourceRuntimeDefaults ?? adapterRuntimeDefaults ?? null;

    const baseSeed = adapter.buildTopicSeed({
        blueprint: args.blueprint,
        module: {
            slug: args.module.moduleSlug,
            prefix: args.module.prefix,
            title: args.module.title,
            order: args.module.order,
            purpose: args.module.purpose,
            learningObjectives:
                args.module.learningObjectives ?? args.topic.learningGoals ?? [],
            guidedExercises: args.module.guidedExercises ?? [],
            quizFocus: args.module.quizFocus ?? [],
            moduleProject: args.module.moduleProject,
            runtimeDefaults: moduleRuntimeDefaults,
            exercisePolicy,
        },
        section: {
            slug: args.section.sectionSlug,
            title: args.section.title,
            order: args.section.order,
        },
        topic: {
            topicId: args.topic.topicId,
            order: args.topic.order,
            title: args.topic.title,
            summary: args.topic.summary,
            minutes: args.topic.minutes,
        },
    });
    const workspacePolicy = resolveWorkspacePolicy({
        blueprint: args.blueprint,
        moduleNumber: args.module.order - 1,
        topicId: args.topic.topicId,
    });

    const workspaceRuntimeDefaults = workspaceToRuntimeDefaults({
        policy: workspacePolicy,
        profileId: args.blueprint.profileId,
    });

    const mergedRuntimeDefaults: ManifestRuntimeDefaults =
        workspaceRuntimeDefaults.kind === "sql" && moduleRuntimeDefaults?.kind === "sql"
            ? {
                ...workspaceRuntimeDefaults,
                datasetId: moduleRuntimeDefaults.datasetId,
                fixedSqlDialect: moduleRuntimeDefaults.fixedSqlDialect,
                resultShape: moduleRuntimeDefaults.resultShape,
            }
            : workspaceRuntimeDefaults;

    const policyTargets =
        args.spec?.policy?.exercisePolicy?.generationTargets ?? {};

    const generationTargets = {
        quizBankMin: policyTargets.quizBankMin ?? 6,
        quizBankTarget: policyTargets.quizBankTarget ?? 8,
        quizVisibleDefault: policyTargets.quizVisibleDefault ?? 4,
        quizVisibleMax: policyTargets.quizVisibleMax ?? 6,

        projectCodeInputMin: policyTargets.projectCodeInputMin ?? 3,
        projectCodeInputTarget: policyTargets.projectCodeInputTarget ?? 3,
        projectCodeInputMax: policyTargets.projectCodeInputMax ?? 5,

        maxAttempts: policyTargets.maxAttempts ?? null,
    };

    const totalGeneratedExercises =
        generationTargets.quizBankTarget +
        generationTargets.projectCodeInputTarget;

    const plannedExerciseCounts = planExerciseCounts({
        policy: exercisePolicy,
        total: totalGeneratedExercises,
        constraints: {
            code_input: {
                min: generationTargets.projectCodeInputTarget,
                max: generationTargets.projectCodeInputTarget,
            },
        },
    });
    return {
        ...baseSeed,

        // Resolved course-plan identity. These fields are the source of truth.
        subjectSlug: args.blueprint.subjectSlug,
        profileId: args.blueprint.profileId,
        moduleSlug: args.module.moduleSlug,
        modulePrefix: args.module.prefix,
        moduleOrder: args.module.order,
        sectionSlug: args.section.sectionSlug,
        sectionOrder: args.section.order,
        topicId: args.topic.topicId,
        order: args.topic.order,
        title: args.topic.title,
        summary: args.topic.summary,
        minutes: args.topic.minutes,

        exercisePolicy,
        workspacePolicy,
        generationTargets,
        plannedExerciseCounts,
        moduleRuntimeDefaults: mergedRuntimeDefaults,
    };
}