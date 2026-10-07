import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Review shared ownership", () => {
    it("publishes the canonical Review drawer and module-nav owners", () => {
        const packageJson = JSON.parse(
            source("packages/learner-workspace/package.json"),
        ) as { exports?: Record<string, string> };

        expect(
            packageJson.exports?.[
                "./review/components/layout/MobileDrawer"
            ],
        ).toBe("./src/review/components/layout/MobileDrawer.tsx");

        expect(
            packageJson.exports?.[
                "./review/components/layout/ReviewCourseModulesDrawer"
            ],
        ).toBe("./src/review/components/layout/ReviewCourseModulesDrawer.tsx");

        expect(
            packageJson.exports?.[
                "./review/hooks/useModuleNav"
            ],
        ).toBe("./src/review/hooks/useModuleNav.ts");
    });

    it.each([
        "apps/web/src/components/review/module/components/layout/MobileDrawer.tsx",
        "apps/student/src/legacy-web/components/review/module/components/layout/MobileDrawer.tsx",
    ])("%s is only a shared-package adapter", (relativePath) => {
        const adapter = source(relativePath);

        expect(adapter).toContain(
            "@zoeskoul/learner-workspace/review/components/layout/MobileDrawer",
        );
        expect(adapter).not.toContain("ui-review-drawer-backdrop");
        expect(adapter).not.toContain("<aside");
        expect(adapter.length).toBeLessThan(300);
    });

    it.each([
        "apps/web/src/components/review/module/hooks/useModuleNav.ts",
        "apps/student/src/legacy-web/components/review/module/hooks/useModuleNav.ts",
    ])("%s does not own module-nav fetching anymore", (relativePath) => {
        const adapter = source(relativePath);

        expect(adapter).toContain(
            "@zoeskoul/learner-workspace/review/hooks/useModuleNav",
        );
        expect(adapter).not.toContain("fetch(");
        expect(adapter).not.toContain("useEffect");
        expect(adapter.length).toBeLessThan(600);
    });

    it.each([
        "apps/web/src/components/review/module/components/layout/ReviewCourseModulesDrawer.tsx",
        "apps/student/src/legacy-web/components/review/module/components/layout/ReviewCourseModulesDrawer.tsx",
    ])("%s keeps only app i18n wiring", (relativePath) => {
        const adapter = source(relativePath);

        expect(adapter).toContain('useTranslations("review.courseDrawer")');
        expect(adapter).toContain(
            "@zoeskoul/learner-workspace/review/components/layout/ReviewCourseModulesDrawer",
        );
        expect(adapter).not.toContain("<ProgressRing");
        expect(adapter).not.toContain("function ModuleRow");
        expect(adapter).not.toContain("ui-review-topic-btn");
    });

    it("moves the duplicated behavioral tests to the canonical package", () => {
        for (const relativePath of [
            "apps/web/src/components/review/module/components/layout/MobileDrawer.test.tsx",
            "apps/student/src/legacy-web/components/review/module/components/layout/MobileDrawer.test.tsx",
            "apps/web/src/components/review/module/components/layout/ReviewCourseModulesDrawer.test.tsx",
            "apps/student/src/legacy-web/components/review/module/components/layout/ReviewCourseModulesDrawer.test.tsx",
        ]) {
            expect(fs.existsSync(path.join(ROOT, relativePath))).toBe(false);
        }

        expect(
            fs.existsSync(
                path.join(
                    ROOT,
                    "packages/learner-workspace/src/review/components/layout/MobileDrawer.test.ts",
                ),
            ),
        ).toBe(true);

        expect(
            fs.existsSync(
                path.join(
                    ROOT,
                    "packages/learner-workspace/src/review/components/layout/ReviewCourseModulesDrawer.test.ts",
                ),
            ),
        ).toBe(true);
    });
});
