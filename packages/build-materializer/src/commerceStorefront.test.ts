import { describe, expect, it } from "vitest";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { materializeRegisteredBuildProject } from "./index";

const specification: ProjectSpecification = {
  version: 1,
  name: "Maison Example",
  projectType: "fullstack-app",
  targets: ["web"],
  requirements: {
    backend: true,
    database: false,
    auth: false,
    storage: false,
    payments: true,
    email: false,
    commerce: true,
  },
  pages: ["Home", "Shop", "Cart"],
  stackId: "tanstack-start-v1",
  commerce: { storefrontRuntime: "tanstack-start" },
  deployment: { preference: "managed-runtime" },
};

describe("TanStack commerce storefront materialization", () => {
  it("materializes the single registered full-stack template without legacy provider JavaScript", () => {
    const materialized = materializeRegisteredBuildProject({ specification, createdAt: 1 });
    expect(materialized.stackId).toBe("tanstack-start-v1");
    expect(materialized.templateId).toBe("tanstack-start-v1");
    const files = new Map(materialized.workspace.nodes
      .filter((node) => node.kind === "file")
      .map((node) => [node.id, node.content ?? ""]));
    expect(files.has("package.json")).toBe(true);
    expect(files.has("src/routes/__root.tsx")).toBe(true);
    expect(files.has("src/functions/siteInfo.functions.ts")).toBe(true);
    expect(files.has("src/commerce/provider.js")).toBe(false);
    expect(files.has("src/commerce/shopifyStorefront.js")).toBe(false);
    expect(files.get("package.json")).toContain("@tanstack/react-start");
    expect(materialized.dependencyLock).toEqual({
      manager: "pnpm",
      policy: "generate-once",
      lockfilePath: "pnpm-lock.yaml",
    });
  });
});
