import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ProjectSpecification,
} from "@zoeskoul/build-contracts";

import {
  materializeRegisteredBuildProject,
} from "./index";

const specification:
  ProjectSpecification = {
    version: 1,

    name:
      "Maison Example",

    projectType:
      "frontend-app",

    targets: [
      "web",
    ],

    requirements: {
      backend: false,
      database: false,
      auth: false,
      storage: false,
      payments: true,
      email: false,
      commerce: true,
    },

    pages: [
      "Home",
      "Shop",
      "Cart",
    ],

    stackId:
      "commerce-storefront-v1",

    deployment: {
      preference:
        "static",
    },
  };

describe(
  "commerce storefront materialization",
  () => {
    it(
      "materializes through the canonical registered-project boundary",
      () => {
        const result =
          materializeRegisteredBuildProject({
            specification,
            createdAt: 1,
          });

        expect(
          result.stackId,
        ).toBe(
          "commerce-storefront-v1",
        );

        expect(
          result.templateId,
        ).toBe(
          "commerce-storefront-v1",
        );

        expect(
          result.entryPath,
        ).toBe(
          "index.html",
        );

        expect(
          result.dependencyLock,
        ).toBeNull();

        const workspace =
          JSON.stringify(
            result.workspace,
          );

        expect(
          workspace,
        ).toContain(
          "src/design/theme.css",
        );

        expect(
          workspace,
        ).toContain(
          "src/design/content.js",
        );

        expect(
          workspace,
        ).toContain(
          "src/design/layout.js",
        );

        expect(
          workspace,
        ).toContain(
          "src/commerce/shopifyStorefront.js",
        );

        expect(
          workspace,
        ).toContain(
          "checkoutUrl",
        );
      },
    );
  },
);
