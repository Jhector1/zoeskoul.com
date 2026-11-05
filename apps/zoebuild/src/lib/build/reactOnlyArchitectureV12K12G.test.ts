import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const registry = readFileSync(new URL("../../../../../packages/build-template-registry/src/index.ts", import.meta.url), "utf8");
const template = readFileSync(new URL("../../../../../packages/build-template-registry/src/tanstackStartTemplate.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../../../../../packages/build-application/src/index.ts", import.meta.url), "utf8");
const specs = readFileSync(new URL("./starterProjectSpecifications.ts", import.meta.url), "utf8");
const planner = readFileSync(new URL("./costAwareZoeBuildPlanning.ts", import.meta.url), "utf8");

describe("TanStack Start-only project creation", () => {
  it("registers exactly one full-stack template, without a legacy runtime", () => {
    expect(registry).toContain("TANSTACK_START_TEMPLATE_V1,");
    expect(template).toContain('id: "tanstack-start-v1"');
    expect(registry).not.toContain('id: "static-html-v1"');
    expect(registry).not.toContain('id: "react-vite-v1"');
    expect(registry).not.toContain('id: "commerce-react-vite-v1"');
  });
  it("validates TanStack architecture server-side and separates merchant providers", () => {
    expect(specs).toContain('stackId: "tanstack-start-v1"');
    expect(specs).toContain('projectType: "fullstack-app"');
    expect(specs).toContain('preference: "managed-runtime"');
    expect(specs).not.toContain('"provider": "zoebuild-native"');
    expect(app).toContain('input.specification.stackId !== "tanstack-start-v1"');
    expect(app).toContain('input.specification.commerce?.storefrontRuntime !== "tanstack-start"');
    expect(planner).toContain('storefrontRuntime: "tanstack-start"');
    expect(planner).toContain('stackId:');
    expect(planner).toContain('profile.stackId');
  });
});
