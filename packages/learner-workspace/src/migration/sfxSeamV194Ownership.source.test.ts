import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const items = [
  {
    name: "SfxProvider",
    exportKey: "./lib/sfx/SfxProvider",
    exportTarget: "./src/lib/sfx/SfxProvider.tsx",
    shared: "packages/learner-workspace/src/lib/sfx/SfxProvider.tsx",
    student: "apps/student/src/legacy-web/lib/sfx/SfxProvider.tsx",
    web: "apps/web/src/lib/sfx/SfxProvider.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/lib/sfx/SfxProvider",
  },
  {
    name: "SoundToggle",
    exportKey: "./lib/sfx/SoundToggle",
    exportTarget: "./src/lib/sfx/SoundToggle.tsx",
    shared: "packages/learner-workspace/src/lib/sfx/SoundToggle.tsx",
    student: "apps/student/src/legacy-web/lib/sfx/SoundToggle.tsx",
    web: "apps/web/src/lib/sfx/SoundToggle.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/lib/sfx/SoundToggle",
  },
] as const;

describe("V194 SFX ownership seam", () => {
  it.each(items)("$name is exported", (item) => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.[item.exportKey]).toBe(item.exportTarget);
  });

  it.each(items)("$name leaves matching thin adapters", (item) => {
    const student = source(item.student);
    const web = source(item.web);

    expect(student).toBe(web);
    expect(student).toContain(item.adapterTarget);
    expect(student.split("\n").filter(Boolean).length)
      .toBeLessThanOrEqual(2);
  });

  it("SfxProvider uses package-internal relative SFX modules", () => {
    const shared = source(
      "packages/learner-workspace/src/lib/sfx/SfxProvider.tsx",
    );

    expect(shared).toContain('from "./bus"');
    expect(shared).toContain('from "./engine"');
    expect(shared).toContain('from "./settings"');
    expect(shared).not.toContain(
      "@zoeskoul/learner-workspace/lib/sfx/",
    );
  });

  it("SoundToggle uses the shared SfxProvider relatively", () => {
    const shared = source(
      "packages/learner-workspace/src/lib/sfx/SoundToggle.tsx",
    );

    expect(shared).toContain('from "./SfxProvider"');
    expect(shared).not.toContain("@/lib/sfx/SfxProvider");
  });
});
