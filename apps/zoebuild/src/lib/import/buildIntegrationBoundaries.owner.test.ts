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
  "ZoeBuild AI/import boundary ownership",
  () => {
    it(
      "keeps Shopify normalization in build-imports",
      () => {
        const wrapper = source(
          "apps/zoebuild/src/lib/import/shopify.ts",
        );

        expect(wrapper).toContain(
          'from "@zoeskoul/build-imports"',
        );
        expect(wrapper).not.toContain(
          'endsWith(".myshopify.com")',
        );
      },
    );

    it(
      "keeps provider SDKs out of build-ai and build-imports",
      () => {
        const ai = source(
          "packages/build-ai/src/index.ts",
        );
        const imports = source(
          "packages/build-imports/src/index.ts",
        );

        for (const forbidden of [
          "@google/genai",
          "@anthropic-ai/sdk",
          'from "openai"',
          "@shopify/",
        ]) {
          expect(
            ai.toLowerCase(),
          ).not.toContain(
            forbidden.toLowerCase(),
          );
          expect(
            imports.toLowerCase(),
          ).not.toContain(
            forbidden.toLowerCase(),
          );
        }
      },
    );

    it(
      "requires secretRef for imported store access",
      () => {
        const imports = source(
          "packages/build-imports/src/index.ts",
        );

        expect(imports).toContain(
          "secretRef: string",
        );
        expect(imports).toContain(
          "accessToken: string",
        );
        expect(imports).toContain(
          "Token-bearing authorization results are infrastructure-only",
        );
      },
    );
  },
);
