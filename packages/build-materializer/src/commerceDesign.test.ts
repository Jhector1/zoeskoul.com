import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  BuildDesignSpecification,
  ProjectSpecification,
} from "@zoeskoul/build-contracts";

import {
  requireBuildTemplate,
} from "@zoeskoul/build-template-registry";

import {
  COMMERCE_STOREFRONT_DESIGN_PATHS,
  applyBuildDesignToTemplate,
  materializeRegisteredBuildProject,
} from "./index";

const design:
  BuildDesignSpecification = {
    version: 1,
    style: "luxury",

    palette: {
      surface:
        "#FAF7F2",

      surfaceSoft:
        "#EFE8DE",

      text:
        "#171411",

      muted:
        "#746C63",

      border:
        "#DDD3C7",

      accent:
        "#55392A",

      accentContrast:
        "#FFFFFF",

      artStart:
        "#DCC6B5",

      artEnd:
        "#7D5947",
    },

    layout: {
      hero:
        "editorial",

      productDensity:
        "airy",

      cardTreatment:
        "minimal",
    },

    content: {
      brandName:
        "Maison Zoe",

      eyebrow:
        "Autumn collection",

      heroTitle:
        "Quiet luxury for everyday life.",

      heroBody:
        "A refined collection chosen for texture, proportion, and lasting character.",

      heroCta:
        "Shop collection",

      featuredHeading:
        "Selected pieces",

      storyHeading:
        "Made to stay with you.",

      storyBody:
        "Thoughtful pieces shaped by quality, restraint, and useful beauty.",
    },
  };

const specification:
  ProjectSpecification = {
    version: 1,

    name:
      "Maison Zoe",

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
      "commerce-static-v1",

    commerce: {
      provider:
        "zoebuild-native",
      storefrontRuntime:
        "static",
    },

    design,

    deployment: {
      preference:
        "static",
    },
  };

describe(
  "commerce design materialization",
  () => {
    it(
      "rewrites exactly the registered design surfaces",
      () => {
        const original =
          requireBuildTemplate(
            "commerce-static-v1",
          );

        const customized =
          applyBuildDesignToTemplate(
            specification,
            original,
          );

        const originalByPath =
          new Map<string, string>(
            original.files.map(
              (file) => [
                file.path,
                file.content,
              ],
            ),
          );

        const customByPath =
          new Map<string, string>(
            customized.files.map(
              (file) => [
                file.path,
                file.content,
              ],
            ),
          );

        const changed =
          customized.files
            .filter(
              (file) =>
                originalByPath.get(
                  file.path,
                ) !==
                file.content,
            )
            .map(
              (file) =>
                file.path,
            );

        expect(
          changed.sort(),
        ).toEqual(
          [
            ...COMMERCE_STOREFRONT_DESIGN_PATHS,
          ].sort(),
        );

        for (
          const protectedPath of [
            "index.html",
            "styles/base.css",
            "src/app.js",
            "src/commerce/config.js",
            "src/commerce/provider.js",
            "src/commerce/provider.js",
            "COMMERCE.md",
          ]
        ) {
          expect(
            customByPath.get(
              protectedPath,
            ),
          ).toBe(
            originalByPath.get(
              protectedPath,
            ),
          );
        }
      },
    );

    it(
      "turns validated design data into source through deterministic rendering",
      () => {
        const result =
          materializeRegisteredBuildProject({
            specification,
            createdAt: 1,
          });

        const serialized =
          JSON.stringify(
            result.workspace,
          );

        expect(
          serialized,
        ).toContain(
          "Maison Zoe",
        );

        expect(
          serialized,
        ).toContain(
          "#55392A",
        );

        expect(
          serialized,
        ).toContain(
          "editorial",
        );

        expect(
          serialized,
        ).toContain(
          "commerce.checkout.begin",
        );

        expect(
          serialized,
        ).toContain(
          "__ZOEBUILD_COMMERCE__",
        );

        expect(
          serialized.toLowerCase(),
        ).not.toContain(
          "myshopify.com",
        );
      },
    );
  },
);
