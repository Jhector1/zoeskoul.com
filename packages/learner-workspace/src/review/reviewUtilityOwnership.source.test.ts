import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
    {
        exportKey: "./review/i18n/getOptionalClientMessage",
        shared: "packages/learner-workspace/src/review/i18n/getOptionalClientMessage.ts",
        appRel: "i18n/getOptionalClientMessage.ts",
    },
    {
        exportKey: "./review/hooks/useMediaQuery",
        shared: "packages/learner-workspace/src/review/hooks/useMediaQuery.ts",
        appRel: "hooks/useMediaQuery.ts",
    },
    {
        exportKey: "./review/hooks/useReduceMotion",
        shared: "packages/learner-workspace/src/review/hooks/useReduceMotion.ts",
        appRel: "hooks/useReduceMotion.ts",
    },
    {
        exportKey: "./review/hooks/activeToolScopeKey",
        shared: "packages/learner-workspace/src/review/hooks/activeToolScopeKey.ts",
        appRel: "hooks/activeToolScopeKey.ts",
    },
    {
        exportKey: "./review/types/subjectFinish.types",
        shared: "packages/learner-workspace/src/review/types/subjectFinish.types.ts",
        appRel: "types/subjectFinish.types.ts",
    },
    {
        exportKey: "./review/hooks/rightRailExerciseBinding",
        shared: "packages/learner-workspace/src/review/hooks/rightRailExerciseBinding.ts",
        appRel: "hooks/rightRailExerciseBinding.ts",
    },
] as const;

describe("Review utility shared ownership", () => {
    it("publishes every migrated utility from learner-workspace", () => {
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
        "$appRel is canonically implemented in learner-workspace",
        (item) => {
            const shared = source(item.shared);
            expect(shared.length).toBeGreaterThan(10);
            expect(shared).not.toContain("next/navigation");
            expect(shared).not.toContain('from "@/');
        },
    );

    it.each(migrated)(
        "$appRel leaves only thin Web and Student adapters",
        (item) => {
            const web = source(
                "apps/web/src/components/review/module/" + item.appRel,
            );
            const student = source(
                "apps/student/src/legacy-web/components/review/module/" +
                    item.appRel,
            );

            expect(web).toBe(student);
            expect(web).toContain("@zoeskoul/learner-workspace/review/");
            expect(web).not.toContain("useEffect(");
            expect(web).not.toContain("useState(");
            expect(web).not.toContain("window.matchMedia");
            expect(web).not.toContain("DEFAULT_TOPIC_TOOL_SCOPE_KEY");
            expect(web).not.toContain("cardHasAuthoredExerciseSurface");
            expect(web.length).toBeLessThan(260);
        },
    );
});
