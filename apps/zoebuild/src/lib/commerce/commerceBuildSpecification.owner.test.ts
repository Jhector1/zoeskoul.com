import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(
    fileURLToPath(
      new URL(
        "../../../../../",
        import.meta.url,
      ),
    ),
  );

function read(
  relative:
    string,
) {
  return readFileSync(
    resolve(
      repo,
      relative,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild commerce Build-spec ownership",
  () => {
    it(
      "keeps provider selection out of the Build commerce specification",
      () => {
        const contract =
          read(
            "packages/build-contracts/src/index.ts",
          );

        expect(
          contract,
        ).not.toContain(
          "BUILD_COMMERCE_PROVIDERS",
        );

        expect(
          contract,
        ).not.toContain(
          "BuildCommerceProvider",
        );

        const specification =
          contract.match(
            /export type BuildCommerceSpecification = Readonly<\{[\s\S]*?\}>;/,
          )?.[0] ?? "";

        expect(
          specification,
        ).toContain(
          "storefrontRuntime",
        );

        expect(
          specification,
        ).not.toContain(
          "provider:",
        );
      },
    );

    it(
      "keeps starter storefronts free of operational provider choice",
      () => {
        const starter =
          read(
            "apps/zoebuild/src/lib/build/starterProjectSpecifications.ts",
          );

        expect(
          starter,
        ).toContain(
          '"storefrontRuntime": "static"',
        );

        expect(
          starter,
        ).not.toContain(
          '"provider": "zoebuild-native"',
        );
      },
    );

    it(
      "provisions the commerce orchestration root for every commerce project",
      () => {
        const create =
          read(
            "apps/zoebuild/src/lib/build/createBuildProject.ts",
          );

        expect(
          create,
        ).toContain(
          "input.specification.requirements.commerce",
        );

        expect(
          create,
        ).toContain(
          "tx.commerceStore.create",
        );

        expect(
          create,
        ).toContain(
          "zoeStoreCommerceProviderRoutes",
        );

        expect(
          create,
        ).not.toContain(
          "specification.commerce?.provider",
        );
      },
    );

    it(
      "preserves Shopify import as an onboarding seam instead of a Build-spec provider",
      () => {
        const importer =
          read(
            "apps/zoebuild/src/lib/import/shopify.ts",
          );

        expect(
          importer,
        ).toContain(
          "parseShopifyStoreIdentity",
        );
      },
    );
  },
);
