import type {
    ReviewModule,
    ReviewModuleSection,
    ReviewTopicShape,
} from "@/lib/subjects/types";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import { TOPIC_MANIFESTS as PYTHON_TOPIC_MANIFESTS } from "@/lib/subjects/python/topics.generated";
import { TOPIC_MANIFESTS as PYTHON_V2_TOPIC_MANIFESTS } from "@/lib/subjects/python-v2/topics.generated";
import { TOPIC_MANIFESTS as PYTHON_DATA_FUNCTIONS_TOPIC_MANIFESTS } from "@/lib/subjects/python-data-functions/topics.generated";
import { TOPIC_MANIFESTS as SQL_TOPIC_MANIFESTS } from "@/lib/subjects/sql/topics.generated";
import { TOPIC_MANIFESTS as SQL_V2_TOPIC_MANIFESTS } from "@/lib/subjects/sql-v2/topics.generated";
import type { SlimTopicManifest } from "@/lib/subjects/_core/subjectManifestTypes";

function indexBy<T extends { slug: string }>(items: readonly T[]) {
    return Object.fromEntries(items.map((x) => [x.slug, x])) as Record<string, T>;
}

function sortByOrderThenSlug<T extends { order: number; slug: string }>(a: T, b: T) {
    return a.order - b.order || a.slug.localeCompare(b.slug);
}

const moduleBySlug = indexBy(SUBJECT_ARTIFACTS.modules);
const sectionBySlug = indexBy(SUBJECT_ARTIFACTS.sections);
const subjectBySlug = indexBy(SUBJECT_ARTIFACTS.subjects);

function readSubjectVersionFamily(subject: (typeof SUBJECT_ARTIFACTS.subjects)[number] | null) {
    const family = (subject?.meta as { versioning?: { family?: unknown } } | null | undefined)
        ?.versioning?.family;
    return typeof family === "string" && family.trim() ? family : null;
}

function makeSubtitle(moduleSlug: string): string {
    const mod = moduleBySlug[moduleSlug];
    return mod?.description ?? "";
}

function cloneReviewTopic(
    topic: ReviewTopicShape,
    rawManifest?: SlimTopicManifest | null,
): ReviewTopicShape {
    return {
        ...topic,
        meta: {
            ...(topic.meta ?? {}),
            rawManifest: rawManifest ?? null,
        },
        cards: [...topic.cards],
    };
}

function getTopicManifestForSubject(
    subjectSlug: string,
    topicSlugOrId: string,
): SlimTopicManifest | null {
    const topicId = String(topicSlugOrId ?? "").includes(".")
        ? String(topicSlugOrId).split(".").slice(1).join(".")
        : String(topicSlugOrId ?? "");

    if (!topicId) return null;

    switch (subjectSlug) {
        case "python":
            return PYTHON_TOPIC_MANIFESTS[topicId] ?? null;
        case "python-v2":
            return PYTHON_V2_TOPIC_MANIFESTS[topicId] ?? null;
        case "python-data-functions":
        case "python--python-data-functions--draft":
            return PYTHON_DATA_FUNCTIONS_TOPIC_MANIFESTS[topicId] ?? null;
        case "sql":
            return SQL_TOPIC_MANIFESTS[topicId] ?? null;
        case "sql-v2":
            return SQL_V2_TOPIC_MANIFESTS[topicId] ?? null;
        default:
            return null;
    }
}

function getReviewTopicBySlug(subjectSlug: string, topicSlug: string): ReviewTopicShape | null {
    const topic = SUBJECT_ARTIFACTS.reviewTopicsBySlug[topicSlug];
    if (!topic) return null;
    return cloneReviewTopic(topic, getTopicManifestForSubject(subjectSlug, topicSlug));
}

function getFallbackModuleTopics(moduleEntry: {
    topicIds: string[];
    topics: Record<string, string>;
}, subjectSlug: string): ReviewTopicShape[] {
    return moduleEntry.topicIds
        .map((topicId) => moduleEntry.topics[topicId])
        .map((topicSlug) => getReviewTopicBySlug(subjectSlug, topicSlug))
        .filter((topic): topic is ReviewTopicShape => Boolean(topic));
}

function getModuleSections(moduleSlug: string, subjectSlug: string): ReviewModuleSection[] {
    return SUBJECT_ARTIFACTS.sections
        .filter((section) => section.moduleSlug === moduleSlug)
        .sort(sortByOrderThenSlug)
        .map((section) => {
            const topics = section.topicSlugs
                .map((topicSlug) => getReviewTopicBySlug(subjectSlug, topicSlug))
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
    const subject = subjectBySlug[subjectSlug] ?? null;

    const moduleEntry = subjectEntry.modulesBySlug[moduleSlug];
    if (!moduleEntry) return null;

    const mod = moduleBySlug[moduleSlug];
    const section = sectionBySlug[moduleEntry.sectionSlug];

    /**
     * Important:
     * Keep this flat list based on moduleEntry.topicIds.
     * This preserves the current behavior for progress, navigation, and rendering.
     */
    const topics = getFallbackModuleTopics(moduleEntry, subjectSlug);

    /**
     * New sidebar structure.
     * This is additive only.
     */
    const sections = getModuleSections(moduleSlug, subjectSlug);

    return {
        id: moduleSlug,
        title: mod?.title ?? moduleSlug,
        subtitle: makeSubtitle(moduleSlug),
        startPracticeSectionSlug: section?.slug ?? moduleEntry.sectionSlug,
        profileId:
            typeof subject?.profileId === "string" && subject.profileId.trim()
                ? subject.profileId
                : null,
        versionFamily: readSubjectVersionFamily(subject),
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
