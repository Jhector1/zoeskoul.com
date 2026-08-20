import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function productionStartOwners() {
  const roots = [
    "apps/web/src",
    "apps/student/src",
    "packages/learning-client/src",
  ];
  const owners: string[] = [];
  const endpoint = "/api/practice/start";

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

describe("one sessionless self-paced Practice entrypoint", () => {
  it("keeps one production owner for normal Practice start", () => {
    expect(productionStartOwners()).toEqual([
      "packages/learning-client/src/selfPacedPractice.ts",
    ]);
  });

  it("does not create a PracticeSession for normal self-paced Practice", () => {
    const startRoute = read("apps/web/src/app/api/practice/start/route.ts");
    expect(startRoute).not.toContain("prisma.practiceSession.create");
    expect(startRoute).not.toContain('mode: "standard"');
    expect(startRoute).toContain('experienceMode: "practice"');
    expect(startRoute).toContain("practiceRunId");
  });

  it("removes the old normal-Practice session-start route", () => {
    expect(
      fs.existsSync(
        path.join(
          repoRoot,
          "apps/web/src/app/api/practice/session/start/route.ts",
        ),
      ),
    ).toBe(false);
  });

  it("persists canonical learner+module+authored identity without sessionId", () => {
    const repo = read(
      "apps/web/src/lib/practice/api/get/repositories/instance.repo.ts",
    );
    expect(repo).toContain("selfPacedPracticeExperienceItemKey");
    expect(repo).toContain("ownerUserId");
    expect(repo).toContain("ownerModuleSlug");
  });

  it("allows normal authored Practice GETs without sessionId", () => {
    expect(read("apps/web/src/app/api/practice/route.ts")).not.toContain(
      "PRACTICE_SESSION_REQUIRED",
    );
    for (const file of [
      "apps/web/src/features/practice/client/usePracticeEngine.ts",
      "apps/student/src/features/practice/client/usePracticeEngine.ts",
    ]) {
      const source = read(file);
      expect(source).not.toContain(
        "Practice session is required. Start Practice from a supported entry point.",
      );
      expect(source).toContain("practiceRunId");
      expect(source).toContain("practiceRunStartedAt");
    }
  });

  it("keeps legacy/assignment sessions compatible but defaults module Practice to practice", () => {
    const policy = read("apps/web/src/lib/practice/experience/routePolicy.ts");
    expect(policy).toContain('defaultMode: "practice"');
    expect(policy).toContain('["practice", "standard", "assignment"]');

    for (const file of [
      "apps/web/src/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/practice/practice-client.tsx",
      "apps/student/src/features/practice/client/PracticeClient.tsx",
    ]) {
      expect(read(file)).toContain("sessionId: string | null;");
    }
  });
});
