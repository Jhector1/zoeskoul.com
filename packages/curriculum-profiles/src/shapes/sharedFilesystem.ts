import type { FileSystemShape } from "./types.js";

export const sharedFilesystem: FileSystemShape = {
    subjectRootDir: (subjectSlug) => `apps/web/src/lib/subjects/${subjectSlug}`,
    moduleDirName: (moduleOrder) => `module${moduleOrder}`,
    topicDirName: (topicId) => topicId,
    topicBundleFileName: "topic.bundle.json",
    subjectManifestFileName: "subject.manifest.json",
    topicsGeneratedFileName: "topics.generated.ts",

    messageSubjectDir: (locale, subjectSlug) =>
        `apps/web/src/i18n/messages/${locale}/subjects/${subjectSlug}`,
    messageModuleDirName: (moduleOrder) => `module${moduleOrder}`,
    messageTopicFileName: (topicId) => `${topicId}.json`,
};