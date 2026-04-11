import {defineCourse} from "@/lib/subjects/_core/defineCourse";
import {defineModule} from "@/lib/subjects/_core/defineModule";
import {defineSection} from "@/lib/subjects/_core/defineSection";
import {defineJsonTopicBundle} from "@/lib/subjects/_core/defineJsonTopicBundle";
import {tag} from "@/lib/practice/generator/shared/i18n";
import {withTopicParentContext} from "./withTopicParentContext";
import type {
    SubjectManifest,
    TopicManifestRefMap,
} from "./subjectManifestTypes";

export function defineCourseFromManifest(args: {
    manifest: SubjectManifest;
    topicManifests: TopicManifestRefMap;
}) {
    const {manifest, topicManifests} = args;

    const modules = manifest.modules.map((moduleManifest) => {
        const sections = moduleManifest.sections.map((sectionManifest) => {
            const topics = sectionManifest.topics.map((topicId) => {
                const topicManifest = topicManifests[topicId];
                if (!topicManifest) {
                    throw new Error(
                        `Missing topic manifest "${topicId}" in module "${moduleManifest.slug}" section "${sectionManifest.slug}".`,
                    );
                }

                return defineJsonTopicBundle(
                    withTopicParentContext({
                        manifest: topicManifest,
                        subjectSlug: manifest.subject.slug,
                        moduleSlug: moduleManifest.slug,
                        sectionSlug: sectionManifest.slug,
                        prefix: moduleManifest.prefix,
                        moduleRuntimeDefaults: moduleManifest.runtimeDefaults ?? null,
                    }),
                );
            });

            return defineSection({
                section: {
                    slug: sectionManifest.slug,
                    order: sectionManifest.order,
                    title: tag(sectionManifest.titleKey),
                    description: sectionManifest.descriptionKey
                        ? tag(sectionManifest.descriptionKey)
                        : undefined,
                    meta: {
                        ...(sectionManifest.meta?.module != null
                            ? {module: sectionManifest.meta.module}
                            : {}),
                        ...(sectionManifest.meta?.weeksKey
                            ? {weeks: tag(sectionManifest.meta.weeksKey)}
                            : {}),
                        ...(sectionManifest.meta?.bulletKeys?.length
                            ? {bullets: sectionManifest.meta.bulletKeys.map((k) => tag(k))}
                            : {}),
                    },
                },
                topics,
            });
        });

// inside defineCourseFromManifest

        return defineModule({
            module: {
                slug: moduleManifest.slug,
                subjectSlug: manifest.subject.slug,
                order: moduleManifest.order,
                title: tag(moduleManifest.titleKey),
                description: moduleManifest.descriptionKey
                    ? tag(moduleManifest.descriptionKey)
                    : undefined,
                ...(moduleManifest.weekStart != null
                    ? { weekStart: moduleManifest.weekStart }
                    : {}),
                ...(moduleManifest.weekEnd != null
                    ? { weekEnd: moduleManifest.weekEnd }
                    : {}),

                runtimeDefaults: moduleManifest.runtimeDefaults ?? null,

                ...(moduleManifest.accessOverride
                    ? { accessOverride: moduleManifest.accessOverride }
                    : {}),
                meta: {
                    ...(moduleManifest.meta?.estimatedMinutes != null
                        ? { estimatedMinutes: moduleManifest.meta.estimatedMinutes }
                        : {}),
                    ...(moduleManifest.meta?.prereqKeys?.length
                        ? { prereqs: moduleManifest.meta.prereqKeys.map((k) => tag(k)) }
                        : {}),
                    ...(moduleManifest.meta?.outcomeKeys?.length
                        ? { outcomes: moduleManifest.meta.outcomeKeys.map((k) => tag(k)) }
                        : {}),
                    ...(moduleManifest.meta?.whyKeys?.length
                        ? { why: moduleManifest.meta.whyKeys.map((k) => tag(k)) }
                        : {}),
                },
            },
            prefix: moduleManifest.prefix,
            genKey: manifest.subject.genKey,
            sections,
        });    });

    return defineCourse({
        subject: {
            slug: manifest.subject.slug,
            order: manifest.subject.order,
            title: tag(manifest.subject.titleKey),
            description: manifest.subject.descriptionKey
                ? tag(manifest.subject.descriptionKey)
                : undefined,
            imagePublicId: manifest.subject.imagePublicId ?? undefined,
            imageAlt: manifest.subject.imageAlt ?? undefined,
            accessPolicy: manifest.subject.accessPolicy ?? "free",
            status: manifest.subject.status ?? "active",
            meta: {
                ...(manifest.subject.meta?.curriculum
                    ? {
                        curriculum: {
                            ...manifest.subject.meta.curriculum,
                            ...(manifest.subject.meta.curriculum.moreComingMessageKey
                                ? {
                                    moreComingMessage: tag(
                                        manifest.subject.meta.curriculum.moreComingMessageKey,
                                    ),
                                }
                                : {}),
                        },
                    }
                    : {}),
                ...(manifest.subject.meta?.completionPolicy
                    ? {
                        completionPolicy: {
                            ...manifest.subject.meta.completionPolicy,
                        },
                    }
                    : {}),
            },
        },
        modules,
    });
}