import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(__dirname, "../../../../..");

function source(path: string) {
  return readFileSync(
    resolve(repo, path),
    "utf8",
  );
}

describe(
  "ZoeBuild Shopify import input",
  () => {
    it(
      "lets the canonical parser own Shopify URL validation",
      () => {
        const composer = source(
          "apps/zoebuild/src/components/builder/ZoeBuildPromptComposer.tsx",
        );

        expect(composer).toContain(
          'type="text"',
        );
        expect(composer).toContain(
          'inputMode="url"',
        );
        expect(composer).not.toContain(
          'type="url"',
        );
        expect(composer).toContain(
          "parseShopifyStoreUrl(shopifyUrl)",
        );
      },
    );

    it(
      "delegates bare Shopify hostname normalization to build-imports",
      () => {
        const importer = source(
          "apps/zoebuild/src/lib/import/shopify.ts",
        );
        const canonical = source(
          "packages/build-imports/src/index.ts",
        );

        expect(importer).toContain(
          'parseShopifyStoreIdentity',
        );
        expect(importer).toContain(
          'from "@zoeskoul/build-imports"',
        );
        expect(importer).not.toContain(
          '.myshopify.com',
        );

        expect(canonical).toContain(
          'raw.includes("://")',
        );
        expect(canonical).toContain(
          '`https://${raw}`',
        );
        expect(canonical).toContain(
          '.myshopify.com',
        );
      },
    );
  },
);
