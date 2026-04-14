export function buildStartPracticeHref(sectionSlug: string, topicSlug: string) {
    return `/practice?section=${encodeURIComponent(sectionSlug)}&difficulty=easy&topic=${encodeURIComponent(topicSlug)}`;
}