import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AiJsonTransport,
} from "@zoeskoul/ai-json";

import {
  createBuildAiPlannerFromJsonTransport,
  planBuildProjectFromPrompt,
} from "./index";

const validSpecification = {
  version: 1,
  name:
    "Photographer Portfolio",
  projectType:
    "static-site",
  targets: ["web"],
  requirements: {
    backend: false,
    database: false,
    auth: false,
    storage: false,
    payments: false,
    email: false,
    commerce: false,
  },
  pages: [
    "Home",
    "Gallery",
    "Contact",
  ],
  stackId:
    "static-html-v1",
  deployment: {
    preference: "static",
  },
} as const;

describe(
  "Build AI multimodal JSON transport adapter",
  () => {
    it(
      "accepts a media-only prompt and still applies the canonical specification gate",
      async () => {
        const capture: {
          request?: Parameters<
            AiJsonTransport[
              "generateJsonText"
            ]
          >[0];
        } = {};

        const transport:
          AiJsonTransport = {
          providerId: "test",
          model: "test-model",
          capabilities: {
            text: true,
            image: true,
            audio: true,
            video: true,
          },

          async generateJsonText(
            request,
          ) {
            capture.request =
              request;

            return {
              text:
                JSON.stringify(
                  validSpecification,
                ),
              metadata: {
                provider: "test",
                model:
                  "test-model",
                temperature: 0,
                schemaName:
                  "ProjectSpecification",
              },
            };
          },
        };

        const media = [
          {
            kind: "image",
            mimeType:
              "image/png",
            name:
              "reference.png",
            source: {
              type: "base64",
              data:
                "aW1hZ2U=",
            },
          },
        ] as const;

        const result =
          await planBuildProjectFromPrompt({
            prompt: "",
            media,
            planner:
              createBuildAiPlannerFromJsonTransport(
                transport,
              ),
          });

        expect(
          capture.request?.media,
        ).toEqual(media);

        expect(
          result.specification.stackId,
        ).toBe(
          "static-html-v1",
        );
      },
    );
  },
);
