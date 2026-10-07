import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const items = [
  {
    name: "VectorPad",
    exportKey: "./components/vectorpad/VectorPad",
    exportTarget: "./src/components/vectorpad/VectorPad.tsx",
    shared: "packages/learner-workspace/src/components/vectorpad/VectorPad.tsx",
    student: "apps/student/src/legacy-web/components/vectorpad/VectorPad.tsx",
    web: "apps/web/src/components/vectorpad/VectorPad.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/components/vectorpad/VectorPad",
  },
  {
    name: "TutoringWorkspaceBar",
    exportKey: "./components/tutoring/TutoringWorkspaceBar",
    exportTarget: "./src/components/tutoring/TutoringWorkspaceBar.tsx",
    shared: "packages/learner-workspace/src/components/tutoring/TutoringWorkspaceBar.tsx",
    student: "apps/student/src/legacy-web/components/tutoring/TutoringWorkspaceBar.tsx",
    web: "apps/web/src/components/tutoring/TutoringWorkspaceBar.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/components/tutoring/TutoringWorkspaceBar",
  },
] as const;

describe("V190 large clean shared owners", () => {
  it.each(items)("$name is exported", (item) => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.[item.exportKey]).toBe(
      item.exportTarget,
    );
  });

  it.each(items)("$name leaves matching thin adapters", (item) => {
    const student = source(item.student);
    const web = source(item.web);

    expect(student).toBe(web);
    expect(student).toContain(item.adapterTarget);
    expect(student.split("\n").filter(Boolean).length)
      .toBeLessThanOrEqual(2);
  });

  it.each(items)("$name has no app-local or Next imports", (item) => {
    const shared = source(item.shared);

    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("apps/student");
    expect(shared).not.toContain("apps/web");
  });
});
