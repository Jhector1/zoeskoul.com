import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "./repoPaths.js";
import {
    getAuthoringCourseSpecPath,
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
});
