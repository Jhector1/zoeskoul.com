import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
const read = (p: string) =>
  readFileSync(resolve(repo, p), "utf8");

describe("commerce runtime wiring", () => {
  const surfaces = [
    read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/preview/route.ts"),
    read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts"),
    read("apps/zoebuild/src/app/sites/[buildProjectId]/[[...path]]/route.ts"),
  ];

  it("uses the generic commerce runtime on all storefront surfaces", () => {
    for (const source of surfaces) {
      expect(source).toContain("@/lib/commerce/commerceRuntime");
      expect(source).not.toContain("requireNativeCommerceCapability");
      expect(source).not.toContain("requireNativeCapability");
      expect(source).not.toContain("ZOEBUILD_NATIVE_COMMERCE_ADAPTER");
    }
  });
});
