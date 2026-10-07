import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Review RingButton shared ownership", () => {
    it("publishes RingButton from learner-workspace", () => {
        const packageJson = JSON.parse(
            source("packages/learner-workspace/package.json"),
        ) as { exports?: Record<string, string> };

        expect(
            packageJson.exports?.["./review/components/RingButton"],
        ).toBe("./src/review/components/RingButton.tsx");
    });

    it("keeps Next routing outside the canonical shared RingButton", () => {
        const shared = source(
            "packages/learner-workspace/src/review/components/RingButton.tsx",
        );

        expect(shared).toContain("ProgressRing");
        expect(shared).toContain("flushSync");
        expect(shared).toContain("useTransition");
        expect(shared).not.toContain("next/navigation");
        expect(shared).not.toContain("useRouter");
        expect(shared).not.toContain("usePathname");
        expect(shared).not.toContain("useSearchParams");
    });

    it.each([
        "apps/web/src/components/review/module/RingButton.tsx",
        "apps/student/src/legacy-web/components/review/module/RingButton.tsx",
    ])("%s is only a Next routing adapter", (relativePath) => {
        const adapter = source(relativePath);

        expect(adapter).toContain("next/navigation");
        expect(adapter).toContain(
            "@zoeskoul/learner-workspace/review/components/RingButton",
        );

        expect(adapter).not.toContain("ProgressRing");
        expect(adapter).not.toContain("Loader2");
        expect(adapter).not.toContain("flushSync");
        expect(adapter).not.toContain("useTransition");
        expect(adapter).not.toContain("ui-ring-button");
        expect(adapter.length).toBeLessThan(1400);
    });

    it("keeps the Web and Student routing adapters identical", () => {
        expect(
            source("apps/web/src/components/review/module/RingButton.tsx"),
        ).toBe(
            source(
                "apps/student/src/legacy-web/components/review/module/RingButton.tsx",
            ),
        );
    });
});
