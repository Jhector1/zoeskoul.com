import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCatalogSlugForSubjectSlug } from "./catalogResolver.js";
import { getRepoRoot } from "./repoPaths.js";
import {
    getBackupRoot,
    getAuthoringCourseSpecPath,
    getDraftSubjectManifestPath,
    getDraftTopicMessagesPath,
    getSubjectManifestPath,
    getTopicBundlePath,
    getAuthoringSharedGenerationPolicyPath,
    getAuthoringSharedValidationPolicyPath,
    getAuthoringSubjectPlanPath,
    getAuthoringSubjectWorkspacePolicyPath,
} from "./curriculumPaths.js";

describe("curriculumPaths", () => {
    it("resolves new subject course spec paths", () => {
        expect(getAuthoringSubjectPlanPath("sql")).toBe(
            path.join(getRepoRoot(), "authoring", "subjects", "sql", "subject.plan.json"),
        );
        expect(getAuthoringCourseSpecPath("sql", "sql-foundations")).toBe(
            path.join(
                getRepoRoot(),
                "authoring",
                "subjects",
                "sql",
                "courses",
                "sql-foundations",
                "course.spec.json",
            ),
        );
        expect(getAuthoringSharedGenerationPolicyPath("platform")).toBe(
            path.join(
                getRepoRoot(),
                "authoring",
                "shared",
                "generation",
                "platform.policy.json",
            ),
        );
        expect(getAuthoringSharedValidationPolicyPath("versioning")).toBe(
            path.join(
                getRepoRoot(),
                "authoring",
                "shared",
                "validation",
                "versioning.validation.json",
            ),
        );
        expect(getAuthoringSubjectWorkspacePolicyPath("sql")).toBe(
            path.join(
                getRepoRoot(),
                "authoring",
                "subjects",
                "sql",
                "shared",
                "workspace.policy.json",
            ),
        );
    });

    it("resolves catalog-first generated artifact paths", () => {
        expect(getCatalogSlugForSubjectSlug("python-v2")).toBe("python");
        expect(
            getCatalogSlugForSubjectSlug("linux--linux-terminal-fundamentals--draft"),
        ).toBe("linux");
        expect(getSubjectManifestPath("python-v2")).toBe(
            path.join(
                getRepoRoot(),
                "apps",
                "web",
                "src",
                "lib",
                "subjects",
                "python",
                "python-v2",
                "subject.manifest.json",
            ),
        );
        expect(getTopicBundlePath("linux-terminal-fundamentals", "module1", "where-am-i")).toBe(
            path.join(
                getRepoRoot(),
                "apps",
                "web",
                "src",
                "lib",
                "subjects",
                "linux",
                "linux-terminal-fundamentals",
                "modules",
                "module1",
                "topics",
                "where-am-i",
                "topic.bundle.json",
            ),
        );
        expect(getDraftSubjectManifestPath("sql-v2")).toBe(
            path.join(
                getRepoRoot(),
                ".curriculum-drafts",
                "sql",
                "subjects",
                "sql-v2",
                "subject.manifest.json",
            ),
        );
        expect(
            getDraftTopicMessagesPath("en", "python-v2", "module0", "what-python-is"),
        ).toBe(
            path.join(
                getRepoRoot(),
                ".curriculum-drafts",
                "python",
                "messages",
                "en",
                "subjects",
                "python-v2",
                "module0",
                "what-python-is.json",
            ),
        );
        expect(getBackupRoot("python-v2--2026-06-20--12-00-00", "python-v2")).toBe(
            path.join(
                getRepoRoot(),
                ".curriculum-backups",
                "python",
                "python-v2--2026-06-20--12-00-00",
            ),
        );
    });

    it("throws when no catalog owns the subject slug", () => {
        expect(() => getCatalogSlugForSubjectSlug("definitely-not-a-real-subject")).toThrow(
            /No catalog owns subject "definitely-not-a-real-subject"/,
        );
    });
});
