import type {
    CourseBlueprint,
    CourseSpec,
    PlannedModule,
    PlannedSection,
    PlannedTopic,
    TopicSeedRuntimeDefaults,
} from "@zoeskoul/curriculum-contracts";
import { getProfileAdapter } from "@zoeskoul/curriculum-profiles";
import { resolveExercisePolicy } from "../spec/resolveExercisePolicy.js";
import { planExerciseCounts } from "../policy/planExerciseCounts.js";

function deriveModuleRuntimeDefaults(args: {
    blueprint: CourseBlueprint;
    spec?: CourseSpec | null;
    moduleSlug: string;
}): TopicSeedRuntimeDefaults | null {
    const moduleSpec = args.spec?.modules.find(
        (module) => module.moduleSlug === args.moduleSlug,
    );

    const runtimePolicy = moduleSpec?.runtimePolicy ?? args.spec?.policy?.runtimePolicy;
    if (!runtimePolicy || typeof runtimePolicy !== "object") {
        return null;
    }

    if ("sqlDialect" in runtimePolicy) {
        return {
            kind: "sql",
            fixedSqlDialect:
                typeof runtimePolicy.sqlDialect === "string"
                    ? runtimePolicy.sqlDialect
                    : undefined,
        };
    }

    return null;
}

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

    const adapterRuntimeDefaults =
        adapter.getTopicSeedRuntimeDefaults?.({
            blueprint: args.blueprint,
            module: {
                slug: args.module.moduleSlug,
                order: args.module.order,
            },
        }) ?? null;

    const specRuntimeDefaults =
        deriveModuleRuntimeDefaults({
            blueprint: args.blueprint,
            spec: args.spec ?? null,
            moduleSlug: args.module.moduleSlug,
        }) ?? null;

    const moduleRuntimeDefaults =
        specRuntimeDefaults ?? adapterRuntimeDefaults ?? null;

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