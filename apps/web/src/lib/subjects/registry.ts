import type {
    ReviewModule,
    ReviewModuleSection,
    ReviewTopicShape,
} from "@/lib/subjects/types";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";

function indexBy<T extends { slug: string }>(items: readonly T[]) {
    return Object.fromEntries(items.map((x) => [x.slug, x])) as Record<string, T>;
}

function sortByOrderThenSlug<T extends { order: number; slug: string }>(a: T, b: T) {
    return a.order - b.order || a.slug.localeCompare(b.slug);
}

const moduleBySlug = indexBy(SUBJECT_ARTIFACTS.modules);
const sectionBySlug = indexBy(SUBJECT_ARTIFACTS.sections);

function makeSubtitle(moduleSlug: string): string {
    const mod = moduleBySlug[moduleSlug];
    return mod?.description ?? "";
}

function cloneReviewTopic(topic: ReviewTopicShape): ReviewTopicShape {
    return {
        ...topic,
        meta: topic.meta ?? null,
        cards: [...topic.cards],
    };
}

function getReviewTopicBySlug(topicSlug: string): ReviewTopicShape | null {
    const topic = SUBJECT_ARTIFACTS.reviewTopicsBySlug[topicSlug];
    if (!topic) return null;
    return cloneReviewTopic(topic);
}

function getFallbackModuleTopics(moduleEntry: {
    topicIds: string[];
    topics: Record<string, string>;
}): ReviewTopicShape[] {
    return moduleEntry.topicIds
        .map((topicId) => moduleEntry.topics[topicId])
        .map(getReviewTopicBySlug)
        .filter((topic): topic is ReviewTopicShape => Boolean(topic));
}

function getModuleSections(moduleSlug: string): ReviewModuleSection[] {
    return SUBJECT_ARTIFACTS.sections
        .filter((section) => section.moduleSlug === moduleSlug)
        .sort(sortByOrderThenSlug)
        .map((section) => {
            const topics = section.topicSlugs
                .map(getReviewTopicBySlug)
                .filter((topic): topic is ReviewTopicShape => Boolean(topic));

            return {
                id: section.slug,
                slug: section.slug,
                title: section.title,
                summary: section.description ?? null,
                description: section.description ?? null,
                order: section.order,
                topics,
            } satisfies ReviewModuleSection;
        })
        .filter((section) => section.topics.length > 0);
}

export function hasReviewModule(subjectSlug: string, moduleSlug: string) {
    const subjectEntry = SUBJECT_ARTIFACTS.catalog[subjectSlug];
    if (!subjectEntry) return false;
    return Boolean(subjectEntry.modulesBySlug[moduleSlug]);
}

export function getRawReviewModule(
    subjectSlug: string,
    moduleSlug: string,
): ReviewModule | null {
    const subjectEntry = SUBJECT_ARTIFACTS.catalog[subjectSlug];
    if (!subjectEntry) return null;

    const moduleEntry = subjectEntry.modulesBySlug[moduleSlug];
    if (!moduleEntry) return null;

    const mod = moduleBySlug[moduleSlug];
    const section = sectionBySlug[moduleEntry.sectionSlug];

    /**
     * Important:
     * Keep this flat list based on moduleEntry.topicIds.
     * This preserves the current behavior for progress, navigation, and rendering.
     */
    const topics = getFallbackModuleTopics(moduleEntry);

    /**
     * New sidebar structure.
     * This is additive only.
     */
    const sections = getModuleSections(moduleSlug);

    return {
        id: moduleSlug,
        title: mod?.title ?? moduleSlug,
        subtitle: makeSubtitle(moduleSlug),
        startPracticeSectionSlug: section?.slug ?? moduleEntry.sectionSlug,
        runtimeDefaults: mod?.runtimeDefaults ?? moduleEntry.runtimeDefaults ?? null,
        serviceDefaults: mod?.serviceDefaults ?? moduleEntry.serviceDefaults ?? null,
        topics,
        sections,
    };
}

export type RawReviewModuleRow = {
    slug: string;
    order: number;
    title: string;
    titleKey?: string;
};

export function getRawReviewModuleRows(subjectSlug: string): RawReviewModuleRow[] | null {
    const subjectExists = SUBJECT_ARTIFACTS.subjects.some((s) => s.slug === subjectSlug);
    if (!subjectExists) return null;

    return SUBJECT_ARTIFACTS.modules
        .filter((m) => m.subjectSlug === subjectSlug && hasReviewModule(subjectSlug, m.slug))
        .sort((a, b) => a.order - b.order)
        .map((m) => ({
            slug: m.slug,
            order: m.order,
            title: m.title,
            titleKey: m.titleKey,
        }));
}
