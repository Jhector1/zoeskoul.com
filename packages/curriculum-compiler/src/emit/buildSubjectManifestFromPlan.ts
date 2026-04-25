import type {
    CourseBlueprint,
    CoursePlan,
    SubjectManifest,
    SubjectModuleManifest,
    SubjectSectionManifest,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { getSqlModuleDataset } from "@zoeskoul/curriculum-profiles";
import { moduleOrderToIndex } from "../spec/moduleOrder.js";

export function buildSubjectManifestFromPlan(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    shape: SubjectShapePack;
}): SubjectManifest {
    const { blueprint, plan, shape } = args;
    const kp = shape.subjectManifest.keyPatterns;

    const modules: SubjectModuleManifest[] = plan.modules.map((module) => {
        const moduleIndex = moduleOrderToIndex(module.order);
        const logicalModuleSlug = shape.subjectManifest.moduleSlug(moduleIndex);

        const sections: SubjectSectionManifest[] = module.sections.map((section) => ({
            slug: shape.subjectManifest.sectionSlug(moduleIndex, section.order),
            order: section.order,
            titleKey: kp.sectionTitleKey(
                blueprint.subjectSlug,
                logicalModuleSlug,
                shape.subjectManifest.sectionSlug(moduleIndex, section.order),
            ),
            descriptionKey: kp.sectionDescriptionKey(
                blueprint.subjectSlug,
                logicalModuleSlug,
                shape.subjectManifest.sectionSlug(moduleIndex, section.order),
            ),
            meta: {
                module: moduleIndex,
                weeksKey: kp.sectionWeeksKey(
                    blueprint.subjectSlug,
                    logicalModuleSlug,
                    shape.subjectManifest.sectionSlug(moduleIndex, section.order),
                ),
                bulletKeys: [0, 1, 2, 3].map((i) =>
                    kp.sectionBulletKey(
                        blueprint.subjectSlug,
                        logicalModuleSlug,
                        shape.subjectManifest.sectionSlug(moduleIndex, section.order),
                        i,
                    ),
                ),
            },
            topics: section.topics.map((t) => t.topicId),
        }));

        return {
            slug: logicalModuleSlug,
            prefix: shape.subjectManifest.modulePrefix(moduleIndex),
            order: moduleIndex,
            titleKey: kp.moduleTitleKey(blueprint.subjectSlug, logicalModuleSlug),
            descriptionKey: kp.moduleDescriptionKey(blueprint.subjectSlug, logicalModuleSlug),
            weekStart: module.weekStart ?? null,
            weekEnd: module.weekEnd ?? null,
            accessOverride: module.order <= 2 ? "free" : null,
            runtimeDefaults:
                blueprint.profileId === "sql"
                    ? {
                        kind: "sql",
                        datasetId: getSqlModuleDataset(moduleIndex),
                        fixedSqlDialect: "sqlite",
                        resultShape: "table",
                    }
                    : undefined,
            meta: {
                estimatedMinutes: module.sections
                    .flatMap((s) => s.topics)
                    .reduce((sum, t) => sum + t.minutes, 0),
                prereqKeys:
                    moduleIndex > 0
                        ? [
                            kp.moduleTitleKey(
                                blueprint.subjectSlug,
                                shape.subjectManifest.moduleSlug(moduleIndex - 1),
                            ),
                        ]
                        : [],
                outcomeKeys: [0, 1, 2, 3].map((i) =>
                    kp.moduleOutcomeKey(blueprint.subjectSlug, logicalModuleSlug, i),
                ),
                whyKeys: [0, 1].map((i) =>
                    kp.moduleWhyKey(blueprint.subjectSlug, logicalModuleSlug, i),
                ),
            },
            sections,
        };
    });

    return {
        subject: {
            slug: blueprint.subjectSlug,
            genKey: shape.subjectManifest.genKey,
            order: blueprint.subjectSlug === "sql" ? 20 : 30,
            accessPolicy: shape.subjectManifest.accessPolicyDefault,
            status: shape.subjectManifest.statusDefault,
            imagePublicId: null,
            imageAlt: null,
            titleKey: kp.subjectTitleKey(blueprint.subjectSlug),
            descriptionKey: kp.subjectDescriptionKey(blueprint.subjectSlug),
            meta: {
                curriculum: {
                    plannedModuleCount: plan.modules.length,
                    isTerminalRelease: false,
                    moreComingMessageKey: kp.subjectMoreComingKey(blueprint.subjectSlug),
                },
                completionPolicy: shape.subjectManifest.completionPolicy,
            },
        },
        modules,
    };
}