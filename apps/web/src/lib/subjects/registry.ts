import type { ReviewModule, ReviewTopicShape } from "@/lib/subjects/types";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";

function indexBy<T extends { slug: string }>(items: readonly T[]) {
    return Object.fromEntries(items.map((x) => [x.slug, x])) as Record<string, T>;
}

const moduleBySlug = indexBy(SUBJECT_ARTIFACTS.modules);
const sectionBySlug = indexBy(SUBJECT_ARTIFACTS.sections);

function makeSubtitle(moduleSlug: string): string {
    const mod = moduleBySlug[moduleSlug];
    return mod?.description ?? "";
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

    const topics: ReviewTopicShape[] = moduleEntry.topicIds
        .map((topicId) => moduleEntry.topics[topicId])
        .map((topicSlug) => SUBJECT_ARTIFACTS.reviewTopicsBySlug[topicSlug])
        .filter((topic): topic is ReviewTopicShape => Boolean(topic))
        .map((topic) => ({
            ...topic,
            meta: topic.meta ?? null,
            cards: [...topic.cards],
        }));

    return {
        id: moduleSlug,
        title: mod?.title ?? moduleSlug,
        subtitle: makeSubtitle(moduleSlug),
        startPracticeSectionSlug: section?.slug ?? moduleEntry.sectionSlug,
        runtimeDefaults: mod?.runtimeDefaults ?? moduleEntry.runtimeDefaults ?? null,
        topics,
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