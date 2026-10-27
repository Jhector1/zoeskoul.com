import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const writer = readFileSync(new URL("./applyBuildProjectPlan.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/apply-plan/route.ts", import.meta.url), "utf8");
const intent = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url), "utf8");

describe("V12K12F existing project stack safety", () => {
  it("checks registered stack inside the owner write transaction before any source save", () => {
    const check = writer.indexOf("buildProject.stackId && buildProject.stackId !== input.stackId");
    const save = writer.indexOf("const saved =");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(save);
    expect(writer).toContain("stackId: true,");
  });
  it("returns a visible 409 instead of silently replacing React with vanilla JS", () => {
    expect(route).toContain("BuildStackReplacementForbiddenError");
    expect(route).toContain("code: error.code");
    expect(route).toContain("}, 409)");
    expect(shell).toContain("plan.specification.stackId !== current.stackId");
  });
  it("treats repurposing an existing project as an edit", () => {
    expect(intent).toContain("Return action=edit when changing, repurposing, redesigning or extending the existing project");
  });
});
