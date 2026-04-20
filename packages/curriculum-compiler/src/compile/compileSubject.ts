import type { CourseBlueprint, CoursePlan, SubjectManifest } from "@zoeskoul/curriculum-contracts";
import {
    buildModuleDescriptionKey,
    buildModulePrefix,
    buildModuleSlug,
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
        modules: plan.modules.map((m, moduleIndex) => ({
            slug: m.moduleSlug || buildModuleSlug(blueprint.subjectSlug, moduleIndex),
            prefix: m.prefix || buildModulePrefix(blueprint.subjectSlug, moduleIndex),
            order: m.order,
            titleKey: buildModuleTitleKey(blueprint.subjectSlug, m.moduleSlug),
            descriptionKey: buildModuleDescriptionKey(blueprint.subjectSlug, m.moduleSlug),
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
                        ? [buildModuleTitleKey(blueprint.subjectSlug, plan.modules[moduleIndex - 1].moduleSlug)]
                        : [],
                outcomeKeys: [],
                whyKeys: [],
            },
            sections: m.sections.map((s, sectionIndex) => ({
                slug: s.sectionSlug,
                order: s.order,
                titleKey: buildSectionTitleKey(blueprint.subjectSlug, m.moduleSlug, s.sectionSlug),
                descriptionKey: buildSectionDescriptionKey(
                    blueprint.subjectSlug,
                    m.moduleSlug,
                    s.sectionSlug,
                ),
                meta: {
                    module: moduleIndex,
                    weeksKey: `sections.${blueprint.subjectSlug}.${m.moduleSlug}.${s.sectionSlug}.weeks`,
                    bulletKeys: [],
                },
                topics: s.topics.map((t) => t.topicId),
            })),
        })),
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

    for (const mod of plan.modules) {
        for (const sec of mod.sections) {
            for (const topic of sec.topics) {
                const compiledTopic = await compileTopic({
                    provider,
                    subjectSlug: blueprint.subjectSlug,
                    profileId: blueprint.profileId,
                    sourceLocale: blueprint.sourceLocale,
                    targetLocales: blueprint.targetLocales,
                    moduleSlug: mod.moduleSlug,
                    sectionSlug: sec.sectionSlug,
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