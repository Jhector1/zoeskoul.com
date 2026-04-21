import type {
    CourseBlueprint,
    CoursePlan,
    SubjectManifest,
} from "@zoeskoul/curriculum-contracts";
import {
    buildModuleDescriptionKey,
    buildModuleTitleKey,
    buildSectionDescriptionKey,
    buildSectionTitleKey,
    buildSubjectDescriptionKey,
    buildSubjectTitleKey,
} from "@zoeskoul/curriculum-core";
import { getProfile } from "@zoeskoul/curriculum-profiles";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { validatePlan } from "../validate/validatePlan.js";
import { validateManifestTree } from "../validate/validateManifestTree.js";
import { writeDraft } from "../write/writeDraft.js";
import { generatePlan } from "../planning/generatePlan.js";
import { compileTopic } from "./compileTopic.js";

function buildSubjectManifestFromPlan(
    blueprint: CourseBlueprint,
    plan: CoursePlan,
): SubjectManifest {
    const profile = getProfile(blueprint.profileId);

    return {
        subject: {
            slug: blueprint.subjectSlug,
            genKey: blueprint.subjectSlug,
            order: 10,
            accessPolicy: "free",
            status: "active",
            titleKey: buildSubjectTitleKey(blueprint.subjectSlug),
            descriptionKey: buildSubjectDescriptionKey(blueprint.subjectSlug),
            meta: {
                curriculum: {
                    plannedModuleCount: plan.modules.length,
                    isTerminalRelease: false,
                    moreComingMessageKey: `subjects.${blueprint.subjectSlug}.moreComingSoon`,
                },
                completionPolicy: {
                    requireAllPublishedModules: true,
                    rewardEnabledByDefault: true,
                    certificateEnabledByDefault: true,
                },
            },
        },
        modules: plan.modules.map((m, moduleIndex) => {
            const canonicalModuleSlug = `module${moduleIndex}`;

            return {
                slug: canonicalModuleSlug,
                prefix: canonicalModuleSlug,
                order: m.order,
                titleKey: buildModuleTitleKey(blueprint.subjectSlug, canonicalModuleSlug),
                descriptionKey: buildModuleDescriptionKey(
                    blueprint.subjectSlug,
                    canonicalModuleSlug,
                ),
                weekStart: m.weekStart ?? null,
                weekEnd: m.weekEnd ?? null,
                accessOverride: "free",
                runtimeDefaults: profile.buildModuleRuntimeDefaults(m),
                meta: {
                    estimatedMinutes: m.sections
                        .flatMap((s) => s.topics)
                        .reduce((sum, t) => sum + (t.minutes ?? 0), 0),
                    prereqKeys:
                        moduleIndex > 0
                            ? [
                                buildModuleTitleKey(
                                    blueprint.subjectSlug,
                                    `module${moduleIndex - 1}`,
                                ),
                            ]
                            : [],
                    outcomeKeys: [],
                    whyKeys: [],
                },
                sections: m.sections.map((s, sectionIndex) => {
                    const canonicalSectionSlug = `section${moduleIndex}_${sectionIndex}`;
                    return {
                        slug: canonicalSectionSlug,
                        order: s.order,
                        titleKey: buildSectionTitleKey(
                            blueprint.subjectSlug,
                            canonicalModuleSlug,
                            canonicalSectionSlug,
                        ),
                        descriptionKey: buildSectionDescriptionKey(
                            blueprint.subjectSlug,
                            canonicalModuleSlug,
                            canonicalSectionSlug,
                        ),
                        meta: {
                            module: moduleIndex,
                            weeksKey: `sections.${blueprint.subjectSlug}.${canonicalModuleSlug}.${canonicalSectionSlug}.weeks`,
                            bulletKeys: [],
                        },
                        topics: s.topics.map((t) => t.topicId),
                    };
                }),
            };
        }),
    };
}

export async function compileSubject(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
}) {
    const { blueprint, provider } = args;

    validateBlueprint(blueprint);

    const plan = await generatePlan({ blueprint, provider });
    validatePlan(plan);

    const subjectManifest = buildSubjectManifestFromPlan(blueprint, plan);
    const topicPacks: Array<{
        topicBundle: any;
        messagesByLocale: Record<string, Record<string, unknown>>;
    }> = [];

    for (let moduleIndex = 0; moduleIndex < plan.modules.length; moduleIndex++) {
        const mod = plan.modules[moduleIndex];
        const canonicalModuleSlug = `module${moduleIndex}`;

        for (let sectionIndex = 0; sectionIndex < mod.sections.length; sectionIndex++) {
            const sec = mod.sections[sectionIndex];
            const canonicalSectionSlug = `section${moduleIndex}_${sectionIndex}`;

            for (const topic of sec.topics) {
                const compiledTopic = await compileTopic({
                    provider,
                    subjectSlug: blueprint.subjectSlug,
                    profileId: blueprint.profileId,
                    sourceLocale: blueprint.sourceLocale,
                    targetLocales: blueprint.targetLocales,
                    moduleSlug: canonicalModuleSlug,
                    sectionSlug: canonicalSectionSlug,
                    topic,
                });

                topicPacks.push(compiledTopic);
            }
        }
    }

    validateManifestTree({ subjectManifest, topicPacks });

    await writeDraft({
        subjectSlug: blueprint.subjectSlug,
        subjectManifest,
        topicPacks,
    });

    return {
        plan,
        subjectManifest,
        topicPacks,
    };
}