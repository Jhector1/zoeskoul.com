import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
  {
    exportKey: "./practice/experience/types",
    shared: "packages/learner-workspace/src/practice/experience/types.ts",
    web: "apps/web/src/lib/practice/experience/types.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/types.ts",
  },
  {
    exportKey: "./practice/experience/routePolicy",
    shared: "packages/learner-workspace/src/practice/experience/routePolicy.ts",
    web: "apps/web/src/lib/practice/experience/routePolicy.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/routePolicy.ts",
  },
  {
    exportKey: "./practice/experience/surface",
    shared: "packages/learner-workspace/src/practice/experience/surface.ts",
    web: "apps/web/src/lib/practice/experience/surface.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/surface.ts",
  },
  {
    exportKey: "./practice/experience/completion",
    shared: "packages/learner-workspace/src/practice/experience/completion.ts",
    web: "apps/web/src/lib/practice/experience/completion.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/completion.ts",
  },
] as const;

describe("Practice experience core shared ownership", () => {
  it("publishes all four shared owners", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    for (const item of migrated) {
      expect(pkg.exports?.[item.exportKey]).toBe(
        "./" + item.shared.replace("packages/learner-workspace/", ""),
      );
    }
  });

  it.each(migrated)(
    "$exportKey leaves identical thin app adapters",
    (item) => {
      const shared = source(item.shared);
      expect(shared).not.toContain('from "@/');
      expect(shared).not.toContain("next/navigation");

      const web = source(item.web);
      const student = source(item.student);

      expect(web).toBe(student);
      expect(web).toContain(
        "@zoeskoul/learner-workspace/practice/experience/",
      );
      expect(
        web.split("\n").filter(Boolean).length,
      ).toBeLessThanOrEqual(3);
    },
  );

  it("keeps the shared policy dependency graph internal", () => {
    const types = source(
      "packages/learner-workspace/src/practice/experience/types.ts",
    );
    const routePolicy = source(
      "packages/learner-workspace/src/practice/experience/routePolicy.ts",
    );
    const surface = source(
      "packages/learner-workspace/src/practice/experience/surface.ts",
    );
    const completion = source(
      "packages/learner-workspace/src/practice/experience/completion.ts",
    );

    expect(types).toContain(
      "@zoeskoul/learner-workspace/contracts/practiceTypes",
    );
    expect(routePolicy).toContain('from "./types"');
    expect(surface).toContain('from "./routePolicy"');
    expect(surface).toContain('from "./types"');
    expect(completion).toContain('from "./types"');
  });
});
