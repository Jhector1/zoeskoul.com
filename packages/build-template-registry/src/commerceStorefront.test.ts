import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BUILD_TEMPLATES_V1,
} from "./index";

function commerceTemplate() {
  const template =
    BUILD_TEMPLATES_V1.find(
      (candidate) =>
        candidate.id ===
        "commerce-storefront-v1",
    );

  if (!template) {
    throw new Error(
      "commerce-storefront-v1 template is not registered",
    );
  }

  return template;
}

describe(
  "commerce storefront deterministic template",
  () => {
    it(
      "separates AI-editable design from trusted commerce mechanics",
      () => {
        const template =
          commerceTemplate();

        expect(
          template.entryPath,
        ).toBe(
          "index.html",
        );

        expect(
          template.dependencyLock,
        ).toBeNull();

        const byPath:
          Map<string, string> =
          new Map(
            template.files.map(
              (file) => [
                file.path,
                file.content,
              ],
            ),
          );

        const designFiles = [
          "src/design/theme.css",
          "src/design/content.js",
          "src/design/layout.js",
        ];

        const protectedFiles = [
          "src/app.js",
          "src/commerce/config.js",
          "src/commerce/provider.js",
          "src/commerce/shopifyStorefront.js",
        ];

        for (
          const path of
          designFiles
        ) {
          expect(
            byPath.has(path),
          ).toBe(true);
        }

        for (
          const path of
          protectedFiles
        ) {
          expect(
            byPath.has(path),
          ).toBe(true);
        }

        const adapter =
          byPath.get(
            "src/commerce/shopifyStorefront.js",
          ) ?? "";

        expect(
          adapter,
        ).toContain(
          "cartCreate",
        );

        expect(
          adapter,
        ).toContain(
          "cartLinesAdd",
        );

        expect(
          adapter,
        ).toContain(
          "checkoutUrl",
        );

        expect(
          adapter,
        ).not.toContain(
          "process.env",
        );
      },
    );

    it(
      "does not pretend preview products have live checkout",
      () => {
        const template =
          commerceTemplate();

        const app =
          template.files.find(
            (file) =>
              file.path ===
              "src/app.js",
          )?.content ?? "";

        expect(
          app,
        ).toContain(
          "Design preview",
        );

        expect(
          app,
        ).toContain(
          "Connect store",
        );

        expect(
          app,
        ).toContain(
          "add.disabled",
        );
      },
    );

    it(
      "documents that payment and private credentials stay outside generated source",
      () => {
        const template =
          commerceTemplate();

        const docs =
          template.files.find(
            (file) =>
              file.path ===
              "COMMERCE.md",
          )?.content ?? "";

        expect(
          docs,
        ).toMatch(
          /Do not put.*Admin API tokens/i,
        );

        expect(
          docs,
        ).toMatch(
          /card data/i,
        );

        expect(
          docs,
        ).toMatch(
          /checkout/i,
        );
      },
    );
  },
);
