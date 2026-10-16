import { describe, expect, it } from "vitest";

import { BUILD_TEMPLATES_V1 } from "./index";

function template(id: string) {
  const value = BUILD_TEMPLATES_V1.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`${id} template missing`);
  return value;
}

describe("commerce runtime templates", () => {
  it("registers provider-neutral static and React/Vite storefronts", () => {
    const staticTemplate = template("commerce-static-v1");
    const reactTemplate = template("commerce-react-vite-v1");

    expect(staticTemplate.dependencyLock).toBeNull();
    expect(reactTemplate.dependencyLock).toMatchObject({ manager: "pnpm" });

    for (const current of [staticTemplate, reactTemplate]) {
      const paths = current.files.map((file) => file.path);
      const provider = current.files.find((file) => file.path === "src/commerce/provider.js")?.content ?? "";

      expect(paths).toContain("src/commerce/provider.js");
      expect(paths).not.toContain("src/commerce/config.js");
      expect(paths).not.toContain("src/commerce/shopifyStorefront.js");
      expect(provider).toContain("__ZOEBUILD_COMMERCE__");
      expect(provider.toLowerCase()).not.toContain("shopify");
    }
  });
});
