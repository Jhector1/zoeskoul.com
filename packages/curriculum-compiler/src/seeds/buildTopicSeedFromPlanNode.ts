import type {
    CourseBlueprint,
    CourseSpec,
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

    return {
        ...baseSeed,
        exercisePolicy,
        plannedExerciseCounts: planExerciseCounts({
            policy: exercisePolicy,
            total: 5,
        }),
        moduleRuntimeDefaults: baseSeed.moduleRuntimeDefaults ?? moduleRuntimeDefaults,
    };
}