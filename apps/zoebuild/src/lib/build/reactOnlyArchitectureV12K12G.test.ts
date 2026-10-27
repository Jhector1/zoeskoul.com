import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const registry = readFileSync(new URL("../../../../../packages/build-template-registry/src/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../../../../../packages/build-application/src/index.ts", import.meta.url), "utf8");
const specs = readFileSync(new URL("./starterProjectSpecifications.ts", import.meta.url), "utf8");
const planner = readFileSync(new URL("./costAwareZoeBuildPlanning.ts", import.meta.url), "utf8");

describe("V12K12G React-only creation", () => {
  it("registers no vanilla/static templates or duplicate commerce stack", () => {
    expect(registry).not.toContain('id: "static-html-v1"');
    expect(registry).not.toContain('id: "commerce-static-v1"');
    expect(registry).not.toContain('id: "commerce-react-vite-v1"');
    expect(registry).toContain('id: "react-vite-v1"');
  });
  it("keeps storefront spec as React+Vite, verified on server", () => {
    expect(specs).not.toContain('"commerce-static-v1"');
    expect(specs).toContain('"storefrontRuntime": "react-vite"');
    expect(app).toContain('input.specification.stackId !== "react-vite-v1"');
    expect(planner).toContain('stackId:\n            "react-vite-v1"');
  });
});
