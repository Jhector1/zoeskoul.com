import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BUILD_STACKS_V1,
} from "./index";

describe(
  "commerce-storefront-v1 stack",
  () => {
    it(
      "registers a provider-neutral static commerce storefront",
      () => {
        const stack =
          BUILD_STACKS_V1.find(
            (candidate) =>
              candidate.id ===
              "commerce-storefront-v1",
          );

        expect(
          stack,
        ).toBeDefined();

        expect(
          stack,
        ).toMatchObject({
          id:
            "commerce-storefront-v1",

          projectTypes: [
            "frontend-app",
          ],

          targets: [
            "web",
          ],

          runtimeProfileId:
            "build-static-v1",

          templateId:
            "commerce-storefront-v1",

          commands: {
            build: [],
          },

          preview: {
            type:
              "static",
          },

          artifact: {
            type:
              "static-directory",
            outputPath: ".",
          },

          deploymentAdapterId:
            "static-assets-v1",
        });

        expect(
          stack
            ?.supportedCapabilities,
        ).toEqual([
          "payments",
          "commerce",
        ]);

        const serialized =
          JSON.stringify(
            stack,
          ).toLowerCase();

        for (
          const provider of [
            "shopify",
            "stripe",
            "square",
            "paypal",
          ]
        ) {
          expect(
            serialized,
          ).not.toContain(
            provider,
          );
        }
      },
    );
  },
);
