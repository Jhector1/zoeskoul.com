import { fromRepoRoot } from "./repoPaths.js";

export function getDraftSubjectRoot(subjectSlug: string) {
    return fromRepoRoot(".curriculum-drafts", "subjects", subjectSlug);
}

export function getDraftMessagesRoot() {
    return fromRepoRoot(".curriculum-drafts", "messages");
}

export function getDraftSubjectManifestPath(subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-drafts",
        "subjects",
        subjectSlug,
        "subject.manifest.json",
    );
}

export function getDraftTopicBundlePath(
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        ".curriculum-drafts",
        "subjects",
        subjectSlug,
        "modules",
        moduleDir,
        "topics",
        topicId,
        "topic.bundle.json",
    );
}

export function getDraftTopicMessagesPath(
    locale: string,
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        ".curriculum-drafts",
        "messages",
        locale,
        "subjects",
        subjectSlug,
        moduleDir,
        `${topicId}.json`,
    );
}

export function getLiveSubjectRoot(subjectSlug: string) {
    return fromRepoRoot("apps", "web", "src", "lib", "subjects", subjectSlug);
}

export function getLiveMessagesRoot() {
    return fromRepoRoot("apps", "web", "src", "i18n", "messages");
}

export function getSubjectManifestPath(subjectSlug: string) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "lib",
        "subjects",
        subjectSlug,
        "subject.manifest.json",
    );
}

export function getTopicBundlePath(
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "lib",
        "subjects",
        subjectSlug,
        "modules",
        moduleDir,
        "topics",
        topicId,
        "topic.bundle.json",
    );
}

export function getTopicMessagesPath(
    locale: string,
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "i18n",
        "messages",
        locale,
        "subjects",
        subjectSlug,
        moduleDir,
        `${topicId}.json`,
    );
}

export function getBackupRoot(timestamp: string) {
    return fromRepoRoot(".curriculum-backups", timestamp);
}

export function getBackupSubjectManifestPath(timestamp: string, subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-backups",
        timestamp,
        "subjects",
        subjectSlug,
        "subject.manifest.json",
    );
}

export function getBackupTopicBundlePath(
    timestamp: string,
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        ".curriculum-backups",
        timestamp,
        "subjects",
        subjectSlug,
        "modules",
        moduleDir,
        "topics",
        topicId,
        "topic.bundle.json",
    );
}

export function getBackupTopicMessagesPath(
    timestamp: string,
    locale: string,
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        ".curriculum-backups",
        timestamp,
        "messages",
        locale,
        "subjects",
        subjectSlug,
        moduleDir,
        `${topicId}.json`,
    );
}