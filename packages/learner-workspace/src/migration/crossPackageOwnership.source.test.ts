import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("cross-package legacy ownership", () => {
  it("moves locale persistence into @zoeskoul/preferences", () => {
    const canonical = source("packages/preferences/src/index.ts");
    expect(canonical).toContain("export function persistLocale");
    expect(canonical).toContain("LEGACY_PREFERENCE_KEYS.locale");
    expect(canonical).toContain("requestAppPreferencesUpdate({ locale })");

    const web = source("apps/web/src/lib/locale/persistLocale.ts");
    const student = source(
      "apps/student/src/legacy-web/lib/locale/persistLocale.ts",
    );
    expect(web).toBe(student);
    expect(web).toContain('from "@zoeskoul/preferences"');
    expect(web).not.toContain("localStorage.setItem");
    expect(web).not.toContain("document.cookie");
  });

  it("moves practice-entry URL policy into @zoeskoul/app-config", () => {
    const canonical = source("packages/app-config/src/index.ts");
    expect(canonical).toContain("export function buildPracticeEntryHref");
    expect(canonical).toContain("export function hasPracticeEntryIntent");
    expect(canonical).toContain("export function removePracticeEntryIntent");

    const web = source("apps/web/src/lib/practice/entry.ts");
    const student = source(
      "apps/student/src/legacy-web/lib/practice/entry.ts",
    );
    expect(web).toBe(student);
    expect(web).toContain('from "@zoeskoul/app-config"');
    expect(web).not.toContain("new URLSearchParams");
    expect(web).not.toContain("new URL(");
  });

  it("moves QuizBlockSkeleton into learner-ui", () => {
    const canonical = source(
      "packages/learner-ui/src/components/QuizBlockSkeleton.tsx",
    );
    expect(canonical).toContain("export function QuizBlockSkeleton");
    expect(canonical).toContain("ui-skel");

    const pkg = JSON.parse(
      source("packages/learner-ui/package.json"),
    ) as { exports?: Record<string, string> };

    expect(
      pkg.exports?.["./components/QuizBlockSkeleton"],
    ).toBe("./src/components/QuizBlockSkeleton.tsx");

    const web = source(
      "apps/web/src/components/review/quiz/components/QuizBlockSkeleton.tsx",
    );
    const student = source(
      "apps/student/src/legacy-web/components/review/quiz/components/QuizBlockSkeleton.tsx",
    );
    expect(web).toBe(student);
    expect(web).toContain(
      "@zoeskoul/learner-ui/components/QuizBlockSkeleton",
    );
    expect(web).not.toContain("ui-skel");
  });
});
