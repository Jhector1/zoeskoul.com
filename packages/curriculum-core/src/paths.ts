export function getSubjectManifestPath(subjectSlug: string) {
    return `src/lib/subjects/${subjectSlug}/subject.manifest.json`;
}

export function getTopicBundlePath(
    subjectSlug: string,
    moduleSlug: string,
    topicId: string,
) {
    return `src/lib/subjects/${subjectSlug}/modules/${moduleSlug}/topics/${topicId}/topic.bundle.json`;
}

export function getSubjectMessagesPath(locale: string, subjectSlug: string) {
    return `src/i18n/messages/${locale}/subjects/${subjectSlug}/subject.json`;
}

export function getTopicMessagesPath(
    locale: string,
    subjectSlug: string,
    moduleSlug: string,
    topicId: string,
) {
    return `src/i18n/messages/${locale}/subjects/${subjectSlug}/${moduleSlug}/${topicId}.json`;
}

export function getDraftSubjectManifestPath(subjectSlug: string) {
    return `.curriculum-drafts/subjects/${subjectSlug}/subject.manifest.json`;
}

export function getDraftTopicBundlePath(
    subjectSlug: string,
    moduleSlug: string,
    topicId: string,
) {
    return `.curriculum-drafts/subjects/${subjectSlug}/modules/${moduleSlug}/topics/${topicId}/topic.bundle.json`;
}

export function getDraftTopicMessagesPath(
    locale: string,
    subjectSlug: string,
    moduleSlug: string,
    topicId: string,
) {
    return `.curriculum-drafts/messages/${locale}/subjects/${subjectSlug}/${moduleSlug}/${topicId}.json`;
}