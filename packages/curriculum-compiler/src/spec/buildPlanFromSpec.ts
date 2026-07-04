import { buildModulePrefix } from "@zoeskoul/curriculum-core";
import type {
    CourseBlueprint,
    CoursePlan,
    CourseSpec,
    PlannedModule,
    PlannedSection,
    PlannedTopic,
} from "@zoeskoul/curriculum-contracts";
import { normalizeSpecModuleOrder } from "./moduleOrder.js";
import { resolveModuleRuntimePolicy } from "./resolveModuleRuntimePolicy.js";

function fallbackSummary(moduleTitle: string, topicTitle: string) {
    return `${topicTitle} in ${moduleTitle}`;
}

export function buildPlanFromSpec(args: {
    blueprint: CourseBlueprint;
    spec: CourseSpec;
}): CoursePlan {
    const modules: PlannedModule[] = args.spec.modules
        .map((module, moduleIndex) => {
            const normalizedOrder = normalizeSpecModuleOrder(module.order, moduleIndex);
            const logicalIndex = normalizedOrder - 1;
            const schedule = args.blueprint.moduleSchedule?.find(
                (entry) => entry.moduleNumber === logicalIndex,
            );
            const sections: PlannedSection[] = module.sections.map((section, sectionIndex) => {
                const topics: PlannedTopic[] = section.topics.map((topic, topicIndex) => ({
                    topicId: topic.topicId,
                    order: topicIndex + 1,
                    title: topic.title,
                    summary: topic.summary ?? fallbackSummary(module.title, topic.title),
                    minutes: topic.minutes ?? 15,
                    technical: topic.technical,
                    learningGoals:
                        topic.learningGoals ??
                        module.learningObjectives ??
                        [],
                    practice: topic.practice,
                }));

                return {
                    sectionSlug: section.sectionSlug,
                    order: sectionIndex + 1,
                    title: section.title,
                    description: section.description,
                    role: section.role,

                    weekStart: module.weekStart ?? schedule?.weekStart ?? null,
                    weekEnd: module.weekEnd ?? schedule?.weekEnd ?? null,
                    weeksLabel: section.weeksLabel ?? null,

                    bullets: section.bullets,

                    topics,
                };
            });

            const runtimePolicy = resolveModuleRuntimePolicy({
                blueprint: args.blueprint,
                spec: args.spec,
                module: {
                    moduleSlug: module.moduleSlug,
                    order: normalizedOrder,
                    runtimePolicy: module.runtimePolicy,
                },
            });

            return {
                moduleSlug: module.moduleSlug,
                moduleNumber: module.moduleNumber,
                prefix: module.prefix ?? buildModulePrefix(args.blueprint.subjectSlug, logicalIndex),
                order: normalizedOrder,
                role: module.role,
                accessOverride: module.accessOverride ?? null,
                title: module.title,
                description: module.description ?? module.purpose ?? "",
                purpose: module.purpose,
                learningObjectives: module.learningObjectives ?? [],
                guidedExercises: module.guidedExercises ?? [],
                quizFocus: module.quizFocus ?? [],
                moduleProject: module.moduleProject,
                weekStart: module.weekStart ?? null,
                weekEnd: module.weekEnd ?? null,
                runtimePolicy,
                sections,
            };
        })
        .sort((a, b) => a.order - b.order);

    return {
        subjectSlug: args.blueprint.subjectSlug,
        profileId: args.blueprint.profileId,
        modules,
    };
}
