import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buildAdapterPath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "apps/zoebuild/src/lib/build/createBuildProject.ts",
);
const canonicalWriterPath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "packages/platform-server/src/projects/saveCodeProject.ts",
);

describe("ZoeBuild persistence ownership", () => {
  it("keeps source and Build metadata bootstrap in one Prisma transaction", () => {
    const source = readFileSync(buildAdapterPath, "utf8");

    expect(source).toContain("$transaction");
    expect(source).toContain("saveCodeProjectInTransaction");
  });

  it("reuses the canonical CodeProject writer instead of duplicating it", () => {
    const adapter = readFileSync(buildAdapterPath, "utf8");
    const writer = readFileSync(canonicalWriterPath, "utf8");

    expect(adapter).toContain(
      '@zoeskoul/platform-server/projects/saveCodeProject',
    );
    expect(writer).toContain("saveCodeProjectInTransaction");
    expect(adapter).not.toContain("codeProjectRevision.create");
  });
  it("provisions a provider-neutral commerce root with default native capability routes in the same transaction", () => {
    const source = readFileSync(buildAdapterPath, "utf8");
    const buildProjectCreate = source.indexOf("tx.buildProject.create");
    const commerceStoreCreate = source.indexOf("tx.commerceStore.create");

    expect(source).toContain("input.specification.requirements.commerce");
    expect(source).not.toContain(
      [
        "input.specification.commerce?.",
        "provider",
      ].join(""),
    );
    expect(source).toContain(
      "defaultNativeCommerceProviderRoutes",
    );
    expect(source).toContain(
      "providerRoutes",
    );
    expect(buildProjectCreate).toBeGreaterThan(-1);
    expect(commerceStoreCreate).toBeGreaterThan(buildProjectCreate);
    expect(source).toContain("buildProjectId: buildProject.id");
    expect(source).toContain('status: "draft"');
    expect(source).toContain("name: input.title");
    expect(source).toContain('defaultCurrency: "USD"');
    expect(source).not.toContain("tx.buildResource.create");
  });

});
