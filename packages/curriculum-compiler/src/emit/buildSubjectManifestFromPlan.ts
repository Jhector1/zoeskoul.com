// packages/curriculum-compiler/src/emit/buildSubjectManifestFromPlan.ts

import type {
    CourseBlueprint,
    CoursePlan,
    ManifestRuntimeDefaults,
    ManifestIdeServiceConfig,

    SubjectManifest,
    SubjectModuleManifest,
    SubjectSectionManifest,

} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { moduleOrderToIndex } from "../spec/moduleOrder.js";
import {
    resolveModuleRuntimePolicy,
    runtimePolicyToTopicRuntimeDefaults,
} from "../spec/resolveModuleRuntimePolicy.js";
import { resolveLogicalSectionSlug } from "./resolveLogicalSectionSlug.js";
import {resolveWorkspacePolicy} from "../policy/resolveWorkspacePolicy.js";
import {workspaceToRuntimeDefaults} from "../policy/workspaceToRuntimeDefaults.js";
import { workspaceToServiceDefaults } from "../policy/workspaceToServiceDefaults.js";
import { mergeManifestIdeServiceConfigs } from "@zoeskoul/curriculum-contracts";
import { resolveModuleOutcomes } from "./resolveModuleOutcomes.js";

function resolveSubjectManifestOrder(blueprint: CourseBlueprint): number {
    if (typeof blueprint.courseNumber === "number" && Number.isFinite(blueprint.courseNumber)) {
        return Math.trunc(blueprint.courseNumber);
    }

    return 0;
}

export function buildSubjectManifestFromPlan(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    shape: SubjectShapePack;
}): SubjectManifest {
    const { blueprint, plan, shape } = args;
    const kp = shape.subjectManifest.keyPatterns;

    const modules: SubjectModuleManifest[] = plan.modules.map((module) => {
        const moduleIndex = moduleOrderToIndex(module.order);
        const logicalModuleNumber =
            typeof module.moduleNumber === "number" && Number.isFinite(module.moduleNumber)
                ? module.moduleNumber
                : moduleIndex;
        const logicalModuleSlug = module.moduleSlug;
        const resolvedRuntimePolicy = resolveModuleRuntimePolicy({
            blueprint,
            module: {
                moduleSlug: module.moduleSlug,
                order: module.order,
                runtimePolicy: module.runtimePolicy,
            },
        });
        const workspacePolicy = resolveWorkspacePolicy({
            blueprint,
            moduleNumber: logicalModuleNumber,
        });

        const workspaceRuntimeDefaults = workspaceToRuntimeDefaults({
            policy: workspacePolicy,
            profileId: blueprint.profileId,
        });

        const topicRuntimeDefaults = runtimePolicyToTopicRuntimeDefaults({
            profileId: blueprint.profileId,
            runtimePolicy: resolvedRuntimePolicy,
        });

        const serviceDefaults: ManifestIdeServiceConfig | null =
            mergeManifestIdeServiceConfigs(
                blueprint.idePolicy?.defaultServices,
                blueprint.idePolicy?.moduleServiceDefaults?.[module.moduleSlug],
                workspaceToServiceDefaults({ policy: workspacePolicy }),
            );

        const runtimeDefaults: ManifestRuntimeDefaults =
            workspaceRuntimeDefaults.kind === "sql" && topicRuntimeDefaults?.kind === "sql"
                ? {
                    ...workspaceRuntimeDefaults,
                    datasetId: topicRuntimeDefaults.datasetId,
                    fixedSqlDialect: topicRuntimeDefaults.fixedSqlDialect,
                    resultShape: topicRuntimeDefaults.resultShape,
                }
                : workspaceRuntimeDefaults;

        const sections: SubjectSectionManifest[] = module.sections.map(
            (section) => {
                const sectionSlug = resolveLogicalSectionSlug({
                    subjectSlug: blueprint.subjectSlug,
                    rawSectionSlug: section.sectionSlug,
                });

                return {
                    slug: sectionSlug,
                    order: section.order,
                    role: section.role,
                    titleKey: kp.sectionTitleKey(
                        blueprint.subjectSlug,
                        logicalModuleSlug,
                        sectionSlug,
                    ),
                    descriptionKey: kp.sectionDescriptionKey(
                        blueprint.subjectSlug,
                        logicalModuleSlug,
                        sectionSlug,
                    ),
                    meta: {
                        module: moduleIndex,
                        weeksKey: kp.sectionWeeksKey(
                            blueprint.subjectSlug,
                            logicalModuleSlug,
                            sectionSlug,
                        ),
                        bulletKeys: [0, 1, 2, 3].map((i) =>
                            kp.sectionBulletKey(
                                blueprint.subjectSlug,
                                logicalModuleSlug,
                                sectionSlug,
                                i,
                            ),
                        ),
                    },
                    serviceDefaults,
                    topics: section.topics.map((topic) => topic.topicId),
                };
            },
        );
        const moduleOutcomes = resolveModuleOutcomes(module);

        return {
            slug: logicalModuleSlug,
            prefix: module.prefix,
            order: moduleIndex,
            role: module.role,
            titleKey: kp.moduleTitleKey(
                blueprint.subjectSlug,
                logicalModuleSlug,
            ),
            descriptionKey: kp.moduleDescriptionKey(
                blueprint.subjectSlug,
                logicalModuleSlug,
            ),
            weekStart: module.weekStart ?? null,
            weekEnd: module.weekEnd ?? null,
            accessOverride:
                module.accessOverride ??
                blueprint.moduleAccessOverrideDefault ??
                null,
            runtimeDefaults,
            serviceDefaults,
            meta: {
                estimatedMinutes: module.sections
                    .flatMap((section) => section.topics)
                    .reduce((sum, topic) => sum + topic.minutes, 0),
                prereqKeys:
                    moduleIndex > 0
                        ? [
                            kp.moduleTitleKey(
                                blueprint.subjectSlug,
                                plan.modules[moduleIndex - 1]?.moduleSlug ??
                                shape.subjectManifest.moduleSlug(moduleIndex - 1),
                            ),
                        ]
                        : [],
                outcomeKeys: moduleOutcomes.map((_, i) =>
                    kp.moduleOutcomeKey(
                        blueprint.subjectSlug,
                        logicalModuleSlug,
                        i,
                    ),
                ),
                whyKeys: [0, 1].map((i) =>
                    kp.moduleWhyKey(
                        blueprint.subjectSlug,
                        logicalModuleSlug,
                        i,
                    ),
                ),
            },
            sections,
        };
    });

    return {
        subject: {
            slug: blueprint.subjectSlug,
            profileId: blueprint.profileId,
            catalogSlug: blueprint.catalogSlug ?? blueprint.subjectSlug,
            genKey: shape.subjectManifest.genKey,
            order: resolveSubjectManifestOrder(blueprint),
            accessPolicy:
                blueprint.accessPolicy ??
                shape.subjectManifest.accessPolicyDefault,
            status: shape.subjectManifest.statusDefault,
            imagePublicId: null,
            imageAlt: null,
            titleKey: kp.subjectTitleKey(blueprint.subjectSlug),
            descriptionKey: kp.subjectDescriptionKey(blueprint.subjectSlug),
            serviceDefaults: mergeManifestIdeServiceConfigs(blueprint.idePolicy?.defaultServices),
            meta: {
                curriculum: {
                    plannedModuleCount: plan.modules.length,
                    isTerminalRelease: false,
                    moreComingMessageKey: kp.subjectMoreComingKey(
                        blueprint.subjectSlug,
                    ),
                },
                completionPolicy: shape.subjectManifest.completionPolicy,
                ...(blueprint.versioning
                    ? {
                        versioning: blueprint.versioning,
                    }
                    : {}),
            },
        },
        modules,
    };
}
