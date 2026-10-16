import { describe, expect, it } from "vitest";

import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { materializeRegisteredBuildProject } from "./index";

const specification: ProjectSpecification = {
  version: 1,
  name: "Maison Example",
  projectType: "frontend-app",
  targets: ["web"],
  requirements: {
    backend: false,
    database: false,
    auth: false,
    storage: false,
    payments: true,
    email: false,
    commerce: true,
  },
  pages: ["Home", "Shop", "Cart"],
  stackId: "commerce-static-v1",
  commerce: {
    provider: "zoebuild-native",
    storefrontRuntime: "static",
  },
  deployment: { preference: "static" },
};

describe("commerce storefront materialization", () => {
  it("materializes the provider-neutral static commerce template", () => {
    const materialized = materializeRegisteredBuildProject({ specification, createdAt: 1 });
    expect(materialized.stackId).toBe("commerce-static-v1");
    expect(materialized.templateId).toBe("commerce-static-v1");

    const files = new Map(
      materialized.workspace.nodes
        .filter((node) => node.kind === "file")
        .map((node) => [node.id, node.content ?? ""]),
    );

    expect(files.has("src/commerce/provider.js")).toBe(true);
    expect(files.has("src/commerce/shopifyStorefront.js")).toBe(false);
    expect(files.get("src/commerce/provider.js")).toContain("__ZOEBUILD_COMMERCE__");
  });
});
