import { fromRepoRoot } from "./repoPaths.js";
import { getCatalogSlugForSubjectSlug } from "./catalogResolver.js";

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
    return fromRepoRoot(
        ".curriculum-drafts",
        getCatalogSlugForSubjectSlug(subjectSlug),
        "subjects",
        subjectSlug,
    );
}

export function getDraftCatalogRoot(subjectSlug: string) {
    return fromRepoRoot(".curriculum-drafts", getCatalogSlugForSubjectSlug(subjectSlug));
}

export function getDraftMessagesRoot(subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-drafts",
        getCatalogSlugForSubjectSlug(subjectSlug),
        "messages",
    );
}

export function getDraftReportsRoot(subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-drafts",
        getCatalogSlugForSubjectSlug(subjectSlug),
        "reports",
        subjectSlug,
    );
}

export function getDraftSubjectManifestPath(subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-drafts",
        getCatalogSlugForSubjectSlug(subjectSlug),
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
        getCatalogSlugForSubjectSlug(subjectSlug),
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
        getCatalogSlugForSubjectSlug(subjectSlug),
        "messages",
        locale,
        "subjects",
        subjectSlug,
        moduleDir,
        `${topicId}.json`,
    );
}

export function getDraftSubjectMessagesPath(locale: string, subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-drafts",
        getCatalogSlugForSubjectSlug(subjectSlug),
        "messages",
        locale,
        "subjects",
        subjectSlug,
        "subject.json",
    );
}

export function getLiveSubjectRoot(subjectSlug: string) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "lib",
        "subjects",
        getCatalogSlugForSubjectSlug(subjectSlug),
        subjectSlug,
    );
}

export function getLiveMessagesRoot(subjectSlug: string) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "i18n",
        "messages",
        getCatalogSlugForSubjectSlug(subjectSlug),
    );
}

export function getLiveSubjectMessagesRoot(locale: string, subjectSlug: string) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "i18n",
        "messages",
        locale,
        "subjects",
        getCatalogSlugForSubjectSlug(subjectSlug),
        subjectSlug,
    );
}

export function getSubjectManifestPath(subjectSlug: string) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "lib",
        "subjects",
        getCatalogSlugForSubjectSlug(subjectSlug),
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
        getCatalogSlugForSubjectSlug(subjectSlug),
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
        getCatalogSlugForSubjectSlug(subjectSlug),
        subjectSlug,
        moduleDir,
        `${topicId}.json`,
    );
}

export function getSubjectMessagesPath(locale: string, subjectSlug: string) {
    return fromRepoRoot(
        "apps",
        "web",
        "src",
        "i18n",
        "messages",
        locale,
        "subjects",
        getCatalogSlugForSubjectSlug(subjectSlug),
        subjectSlug,
        "subject.json",
    );
}

export function getBackupRoot(backupKey: string, subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-backups",
        getCatalogSlugForSubjectSlug(subjectSlug),
        backupKey,
    );
}

export function getBackupSubjectManifestPath(backupKey: string, subjectSlug: string) {
    return fromRepoRoot(
        ".curriculum-backups",
        getCatalogSlugForSubjectSlug(subjectSlug),
        backupKey,
        "subjects",
        subjectSlug,
        "subject.manifest.json",
    );
}

export function getBackupTopicBundlePath(
    backupKey: string,
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        ".curriculum-backups",
        getCatalogSlugForSubjectSlug(subjectSlug),
        backupKey,
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
    backupKey: string,
    locale: string,
    subjectSlug: string,
    moduleDir: string,
    topicId: string,
) {
    return fromRepoRoot(
        ".curriculum-backups",
        getCatalogSlugForSubjectSlug(subjectSlug),
        backupKey,
        "messages",
        locale,
        "subjects",
        subjectSlug,
        moduleDir,
        `${topicId}.json`,
    );
}
