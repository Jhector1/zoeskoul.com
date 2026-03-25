import type { ReviewModule } from "@/lib/subjects/types";
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

function makeStartPracticeHref(sectionSlug: string) {
    return (topicSlug: string) =>
        `/practice?section=${sectionSlug}&difficulty=easy&topic=${encodeURIComponent(topicSlug)}`;
}

export function buildReviewRegistry(): Record<string, Record<string, ReviewModule>> {
    const out: Record<string, Record<string, ReviewModule>> = {};

    for (const [subjectSlug, subjectEntry] of Object.entries(SUBJECT_ARTIFACTS.catalog)) {
        out[subjectSlug] = {};

        for (const [moduleSlug, moduleEntry] of Object.entries(subjectEntry.modulesBySlug)) {
            const mod = moduleBySlug[moduleSlug];
            const section = sectionBySlug[moduleEntry.sectionSlug];

            const topics = moduleEntry.topicIds
                .map((topicId) => moduleEntry.topics[topicId])
                .map((topicSlug) => SUBJECT_ARTIFACTS.reviewTopicsBySlug[topicSlug])
                .filter(Boolean);

            out[subjectSlug][moduleSlug] = {
                id: moduleSlug,
                title: mod?.title ?? moduleSlug,
                subtitle: makeSubtitle(moduleSlug),
                startPracticeHref: makeStartPracticeHref(section?.slug ?? moduleEntry.sectionSlug),
                topics,
            };
        }
    }

    return out;
}