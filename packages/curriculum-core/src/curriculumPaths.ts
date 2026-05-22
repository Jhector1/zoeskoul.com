import { fromRepoRoot } from "./repoPaths.js";

export function getAuthoringRoot() {
    return fromRepoRoot("authoring");
}

export function getAuthoringSharedRoot() {
    return fromRepoRoot("authoring", "shared");
}

export function getAuthoringSharedGenerationRoot() {
    return fromRepoRoot("authoring", "shared", "generation");
}

export function getAuthoringSharedValidationRoot() {
    return fromRepoRoot("authoring", "shared", "validation");
}

export function getAuthoringSharedGenerationPolicyPath(policySlug: string) {
    return fromRepoRoot(
        "authoring",
        "shared",
        "generation",
        `${policySlug}.policy.json`,
    );
}

export function getAuthoringSharedValidationPolicyPath(policySlug: string) {
    return fromRepoRoot(
        "authoring",
        "shared",
        "validation",
        `${policySlug}.validation.json`,
    );
}

export function getAuthoringCatalogPath(catalogSlug: string) {
    return fromRepoRoot("authoring", "catalogs", `${catalogSlug}.catalog.json`);
}

export function getAuthoringSubjectRoot(subjectSlug: string) {
    return fromRepoRoot("authoring", "subjects", subjectSlug);
}

export function getAuthoringSubjectBlueprintPath(subjectSlug: string) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "subject.blueprint.json",
    );
}

export function getAuthoringSubjectPlanPath(subjectSlug: string) {
    return fromRepoRoot("authoring", "subjects", subjectSlug, "subject.plan.json");
}

export function getAuthoringSubjectValidationPath(subjectSlug: string) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "subject.validation.json",
    );
}

export function getAuthoringSubjectSharedRoot(subjectSlug: string) {
    return fromRepoRoot("authoring", "subjects", subjectSlug, "shared");
}

export function getAuthoringSubjectProfilePath(subjectSlug: string) {
    return fromRepoRoot("authoring", "subjects", subjectSlug, "shared", "profile.json");
}

export function getAuthoringSubjectDatasetsPath(subjectSlug: string) {
    return fromRepoRoot("authoring", "subjects", subjectSlug, "shared", "datasets.json");
}

export function getAuthoringSubjectSharedValidationPath(subjectSlug: string) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "shared",
        "validation.policy.json",
    );
}

export function getAuthoringSubjectWorkspacePolicyPath(subjectSlug: string) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "shared",
        "workspace.policy.json",
    );
}

export function getAuthoringCourseRoot(subjectSlug: string, courseSlug: string) {
    return fromRepoRoot("authoring", "subjects", subjectSlug, "courses", courseSlug);
}

export function getAuthoringCourseBlueprintPath(
    subjectSlug: string,
    courseSlug: string,
) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "courses",
        courseSlug,
        "course.blueprint.json",
    );
}

export function getAuthoringCoursePlanPath(subjectSlug: string, courseSlug: string) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "courses",
        courseSlug,
        "course.plan.json",
    );
}

export function getAuthoringCourseSpecPath(subjectSlug: string, courseSlug: string) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "courses",
        courseSlug,
        "course.spec.json",
    );
}

export function getAuthoringCourseValidationPath(
    subjectSlug: string,
    courseSlug: string,
) {
    return fromRepoRoot(
        "authoring",
        "subjects",
        subjectSlug,
        "courses",
        courseSlug,
        "validation.policy.json",
    );
}

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
