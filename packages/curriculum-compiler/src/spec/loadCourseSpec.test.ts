import { describe, expect, it } from "vitest";
import { loadCourseSpec, loadSubjectPlan } from "./loadCourseSpec.js";

describe("authoring spec loaders", () => {
    it("loadSubjectPlan reads authoring/subjects/<subject>/subject.plan.json", async () => {
        const plan = await loadSubjectPlan("sql");

        expect(plan?.subjectSlug).toBe("sql");
        expect(plan?.courseOrder).toContain("sql-v2");
    });

    it("loadCourseSpec reads authoring/subjects/<subject>/courses/<course>/course.spec.json", async () => {
        const spec = await loadCourseSpec("sql", "sql-v2");

        expect(spec?.subjectSlug).toBe("sql");
        expect(spec?.courseSlug).toBe("sql-v2");
        expect(spec?.catalogSlug).toBe("sql");
        expect(spec?.workspaceProfileId).toBe("browser-sql-runner");
        expect(spec?.workspacePolicyId).toBe("sql-browser-workspace");
    });
});
