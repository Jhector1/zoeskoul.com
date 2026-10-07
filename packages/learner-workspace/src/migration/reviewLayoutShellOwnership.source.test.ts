import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
  {
    exportKey: "./review/components/layout/ReviewModuleMobileDrawer",
    shared: "packages/learner-workspace/src/review/components/layout/ReviewModuleMobileDrawer.tsx",
    web: "apps/web/src/components/review/module/components/layout/ReviewModuleMobileDrawer.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/layout/ReviewModuleMobileDrawer.tsx",
    localMarker: "ModuleSidebar",
    sharedNode: "sidebar",
  },
  {
    exportKey: "./review/components/layout/ReviewModuleLeftRail",
    shared: "packages/learner-workspace/src/review/components/layout/ReviewModuleLeftRail.tsx",
    web: "apps/web/src/components/review/module/components/layout/ReviewModuleLeftRail.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/layout/ReviewModuleLeftRail.tsx",
    localMarker: "ModuleSidebar",
    sharedNode: "sidebar",
  },
  {
    exportKey: "./review/components/layout/ReviewModuleRightRail",
    shared: "packages/learner-workspace/src/review/components/layout/ReviewModuleRightRail.tsx",
    web: "apps/web/src/components/review/module/components/layout/ReviewModuleRightRail.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/layout/ReviewModuleRightRail.tsx",
    localMarker: "ToolsPanel",
    sharedNode: "toolsPanel",
  },
  {
    exportKey: "./review/components/layout/ReviewModuleStackedTools",
    shared: "packages/learner-workspace/src/review/components/layout/ReviewModuleStackedTools.tsx",
    web: "apps/web/src/components/review/module/components/layout/ReviewModuleStackedTools.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/layout/ReviewModuleStackedTools.tsx",
    localMarker: "ToolsPanel",
    sharedNode: "toolsPanel",
  },
] as const;

describe("Review layout shell shared ownership", () => {
  it("publishes all four layout shell owners", () => {
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
    "$exportKey leaves only tiny app wiring",
    (item) => {
      const shared = source(item.shared);
      const web = source(item.web);
      const student = source(item.student);

      expect(web).toBe(student);
      expect(web).toContain(
        "@zoeskoul/learner-workspace/review/components/layout/",
      );
      expect(web).toContain(item.localMarker);

      expect(shared).not.toContain('from "@/');
      expect(shared).not.toContain(
        "../../components/ModuleSidebar",
      );
      expect(shared).not.toContain(
        "@/components/tools/ToolsPanel",
      );
      expect(shared).toContain(item.sharedNode);

      expect(
        web.split("\n").filter(Boolean).length,
      ).toBeLessThanOrEqual(8);
    },
  );
});
