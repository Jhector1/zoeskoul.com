import { describe, expect, it } from "vitest";
import { loadCourseSpec, loadSubjectPlan } from "./loadCourseSpec.js";

describe("authoring spec loaders", () => {
    it("loadSubjectPlan reads authoring/subjects/<subject>/subject.plan.json", async () => {
        const plan = await loadSubjectPlan("sql");

        expect(plan?.subjectSlug).toBe("sql");
        expect(plan?.courseOrder).toContain("sql-foundations");
    });

    it("loadCourseSpec reads authoring/subjects/<subject>/courses/<course>/course.spec.json", async () => {
        const spec = await loadCourseSpec("sql", "sql-foundations");

        expect(spec?.subjectSlug).toBe("sql");
        expect(spec?.courseSlug).toBe("sql-foundations");
        expect(spec?.catalogSlug).toBe("sql");
        expect(spec?.workspaceProfileId).toBe("browser-sql-runner");
        expect(spec?.workspacePolicyId).toBe("sql-browser-workspace");
    });
});
