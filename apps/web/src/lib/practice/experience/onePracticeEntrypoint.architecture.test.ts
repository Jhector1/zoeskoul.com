import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function productionSessionStartOwners() {
  const roots = [
    "apps/web/src",
    "apps/student/src",
    "packages/learning-client/src",
  ];
  const owners: string[] = [];
  const endpoint = "/api/practice/session/start";

  function visit(relativePath: string) {
    const absolutePath = path.join(repoRoot, relativePath);
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      const childRelative = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        visit(childRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) continue;
      if (/\.(?:test|spec)\./.test(entry.name)) continue;
      if (read(childRelative).includes(endpoint)) {
        owners.push(childRelative.split(path.sep).join("/"));
      }
    }
  }

  for (const root of roots) visit(root);
  return owners.sort();
}

describe("one self-paced Practice entrypoint", () => {
  it("keeps one production owner for session start", () => {
    expect(productionSessionStartOwners()).toEqual([
      "packages/learning-client/src/selfPacedPractice.ts",
    ]);
  });

  it("keeps normal Practice loading session-backed in both engines", () => {
    for (const file of [
      "apps/web/src/features/practice/client/usePracticeEngine.ts",
      "apps/student/src/features/practice/client/usePracticeEngine.ts",
    ]) {
      const source = read(file);
      expect(source).not.toContain("forceNew");
      expect(source).toContain("async function loadNextExercise()");
      expect(source).toContain(
        "Practice session is required. Start Practice from a supported entry point.",
      );
    }
  });

  it("keeps retry/excuse behavior free of session selection in both apps", () => {
    for (const file of [
      "apps/web/src/lib/flow/usePracticeExcuseActions.ts",
      "apps/student/src/legacy-web/lib/flow/usePracticeExcuseActions.ts",
    ]) {
      const source = read(file);
      expect(source).not.toContain("getEffectiveSid");
      expect(source).not.toContain("forceNew");
      expect(source).toContain("await loadNextExercise();");
    }
  });

  it("requires an authoritative session at the module Practice surface", () => {
    const page = read(
      "apps/web/src/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/practice/page.tsx",
    );
    expect(page).toContain("if (!practiceSessionId) notFound();");

    for (const file of [
      "apps/web/src/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/practice/practice-client.tsx",
      "apps/student/src/features/practice/client/PracticeClient.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("sessionId: string;");
      expect(source).toContain("authoritativeSessionId: true");
      expect(source).not.toContain("sessionId: string | null;");
      expect(source).not.toContain("authoritativeSessionId: Boolean(sessionId)");
    }
  });

  it("rejects the legacy sessionless authored-practice GET contract", () => {
    const source = read("apps/web/src/app/api/practice/route.ts");
    expect(source).toContain(
      'if (!params.sessionId && params.preferPurpose === "practice")',
    );
    expect(source).toContain('code: "PRACTICE_SESSION_REQUIRED"');
  });
});
