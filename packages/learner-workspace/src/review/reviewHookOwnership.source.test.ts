import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
    {
        exportKey: "./review/hooks/useSubjectFinish",
        shared: "packages/learner-workspace/src/review/hooks/useSubjectFinish.ts",
        app: "useSubjectFinish.ts",
        markers: ["useState<SubjectFinishState", "/api/review/subject-finish", "refreshKey"],
    },
    {
        exportKey: "./review/hooks/useSkeletonGate",
        shared: "packages/learner-workspace/src/review/hooks/useSkeletonGate.ts",
        app: "useSkeletonGate.ts",
        markers: ["didFirstReady", "window.setTimeout", "swapKey"],
    },
    {
        exportKey: "./review/hooks/useResizablePanels",
        shared: "packages/learner-workspace/src/review/hooks/useResizablePanels.ts",
        app: "useResizablePanels.ts",
        markers: ["draggingRef", "window.addEventListener", "onMouseDownLeftHandle"],
    },
    {
        exportKey: "./review/hooks/useDebouncedSketchState",
        shared: "packages/learner-workspace/src/review/hooks/useDebouncedSketchState.ts",
        app: "useDebouncedSketchState.ts",
        markers: ["useReviewRuntimeStore", "saveSketchDebounced", "visibilitychange"],
    },
] as const;

describe("Review hook shared ownership", () => {
    it("publishes all four canonical hooks from learner-workspace", () => {
        const packageJson = JSON.parse(
            source("packages/learner-workspace/package.json"),
        ) as { exports?: Record<string, string> };

        for (const item of migrated) {
            expect(packageJson.exports?.[item.exportKey]).toBe(
                "./" + item.shared.replace("packages/learner-workspace/", ""),
            );
        }
    });

    it.each(migrated)(
        "$app keeps behavior only in the shared owner",
        (item) => {
            const shared = source(item.shared);
            for (const marker of item.markers) {
                expect(shared).toContain(marker);
            }
            expect(shared).not.toContain("next/navigation");
            expect(shared).not.toContain('from "@/');

            const web = source(
                "apps/web/src/components/review/module/hooks/" + item.app,
            );
            const student = source(
                "apps/student/src/legacy-web/components/review/module/hooks/" +
                    item.app,
            );

            expect(web).toBe(student);
            expect(web).toContain(
                "@zoeskoul/learner-workspace/review/hooks/",
            );
            for (const marker of item.markers) {
                expect(web).not.toContain(marker);
            }
            expect(web.length).toBeLessThan(180);
        },
    );

    it("uses the shared SubjectFinishState owner from the shared hook", () => {
        const shared = source(
            "packages/learner-workspace/src/review/hooks/useSubjectFinish.ts",
        );
        expect(shared).toContain('../types/subjectFinish.types');
        expect(shared).not.toContain("apps/student");
        expect(shared).not.toContain("apps/web");
    });
});
