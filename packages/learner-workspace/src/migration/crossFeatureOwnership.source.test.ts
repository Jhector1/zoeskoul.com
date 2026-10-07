import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
    {
        exportKey: "./ai-tutor/useAiTutorRuntimeStatus",
        shared: "packages/learner-workspace/src/ai-tutor/useAiTutorRuntimeStatus.ts",
        web: "apps/web/src/components/ai-tutor/useAiTutorRuntimeStatus.ts",
        student: "apps/student/src/legacy-web/components/ai-tutor/useAiTutorRuntimeStatus.ts",
        markers: ["useSyncExternalStore", "subscribeAiTutorRuntimeStatus"],
    },
    {
        exportKey: "./review/quiz/hooks/useDebouncedEmit",
        shared: "packages/learner-workspace/src/review/quiz/hooks/useDebouncedEmit.ts",
        web: "apps/web/src/components/review/quiz/hooks/useDebouncedEmit.ts",
        student: "apps/student/src/legacy-web/components/review/quiz/hooks/useDebouncedEmit.ts",
        markers: ["window.setTimeout", "lastSnapRef"],
    },
    {
        exportKey: "./tools/types",
        shared: "packages/learner-workspace/src/tools/types.ts",
        web: "apps/web/src/components/tools/types.ts",
        student: "apps/student/src/legacy-web/components/tools/types.ts",
        markers: ["export type ToolId", "export type ToolSpec"],
    },
    {
        exportKey: "./practice/shell/mobileActionState",
        shared: "packages/learner-workspace/src/practice/shell/mobileActionState.ts",
        web: "apps/web/src/components/practice/shell/mobileActionState.ts",
        student: "apps/student/src/legacy-web/components/practice/shell/mobileActionState.ts",
        markers: ["resolvePracticeMobilePrimaryAction", "completeEnoughToAdvance"],
    },
    {
        exportKey: "./practice/shell/PracticeMobileSheet",
        shared: "packages/learner-workspace/src/practice/shell/PracticeMobileSheet.tsx",
        web: "apps/web/src/components/practice/shell/PracticeMobileSheet.tsx",
        student: "apps/student/src/legacy-web/components/practice/shell/PracticeMobileSheet.tsx",
        markers: ["document.body.style.overflow", "practice-mobile-sheet"],
    },
] as const;

describe("cross-feature shared ownership", () => {
    it("publishes all five canonical owners", () => {
        const pkg = JSON.parse(
            source("packages/learner-workspace/package.json"),
        ) as { exports?: Record<string, string> };

        for (const item of migrated) {
            expect(pkg.exports?.[item.exportKey]).toBe(
                "./" + item.shared.replace("packages/learner-workspace/", ""),
            );
        }
    });

    it.each(migrated)("$exportKey owns behavior only in learner-workspace", (item) => {
        const shared = source(item.shared);
        for (const marker of item.markers) {
            expect(shared).toContain(marker);
        }
        expect(shared).not.toContain('from "@/');
        expect(shared).not.toContain("next/navigation");

        const web = source(item.web);
        const student = source(item.student);

        expect(web).toBe(student);
        expect(web).toContain("@zoeskoul/learner-workspace/");
        for (const marker of item.markers) {
            expect(web).not.toContain(marker);
        }
        expect(web.length).toBeLessThan(220);
    });
});
