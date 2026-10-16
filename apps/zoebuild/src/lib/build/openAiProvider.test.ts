import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ZOEBUILD_AI_PROVIDER_IDS,
  resolveZoeBuildAiConfig,
} from "./createZoeBuildAiPlanner";

describe(
  "ZoeBuild OpenAI provider configuration",
  () => {
    it(
      "accepts OpenAI as a first-class provider",
      () => {
        expect(
          ZOEBUILD_AI_PROVIDER_IDS,
        ).toContain(
          "openai",
        );

        expect(
          resolveZoeBuildAiConfig({
            ZOEBUILD_AI_PROVIDER:
              "openai",
            ZOEBUILD_AI_MODEL:
              "gpt-6.1-sol",
          }),
        ).toMatchObject({
          provider:
            "openai",
          model:
            "gpt-6.1-sol",
        });
      },
    );

    it(
      "wires only the product-specific OpenAI credential",
      () => {
        const source =
          readFileSync(
            fileURLToPath(
              new URL(
                "./createZoeBuildAiPlanner.ts",
                import.meta.url,
              ),
            ),
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "createOpenAiJsonTransport",
        );

        expect(
          source,
        ).toContain(
          "process.env.OPENAI_API_KEY",
        );

        expect(
          source,
        ).not.toContain(
          "process.env.AI_PROVIDER",
        );

        expect(
          source,
        ).not.toContain(
          "process.env.AI_MODEL",
        );
      },
    );
  },
);
