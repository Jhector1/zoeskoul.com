export function buildReviewQuizKeyPrefix(subjectSlug: string, moduleSlug: string) {
    return `review-quiz|subject=${subjectSlug}|module=${moduleSlug}`;
}