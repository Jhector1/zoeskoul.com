import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("resolvePlan course-scoped resolution", () => {
    it("prefers blueprint.courseSlug before the subject publish target", () => {
        const sourcePath = path.resolve(
            process.cwd(),
            "packages/curriculum-compiler/src/spec/resolvePlan.ts",
        );
        const source = fs.readFileSync(sourcePath, "utf8");

        expect(source).toContain(
            "args.blueprint.courseSlug ??\n        subjectPlan?.publishTarget?.courseSlug ??\n        null",
        );
    });

    it("keeps the subject publish target as the legacy fallback", () => {
        const sourcePath = path.resolve(
            process.cwd(),
            "packages/curriculum-compiler/src/spec/resolvePlan.ts",
        );
        const source = fs.readFileSync(sourcePath, "utf8");

        expect(source).toContain("subjectPlan?.publishTarget?.courseSlug");
    });
});
