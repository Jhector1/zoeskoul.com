import {
  createGeminiAiJsonTransport,
} from "@zoeskoul/ai-json";

import type {
  AiProvider,
  GenerateJsonArgs,
  GeneratedJsonResult,
} from "../types.js";
import {
  buildGeneratedJsonResult,
  generatedJsonMetadata,
  parseProviderJsonText,
  strictJsonSystemPrompt,
} from "./jsonProviderUtils.js";
import {
  getDefaultModelForProvider,
} from "./providerCatalog.js";

export type GeminiProviderOptions = {
  model?: string;
  apiKey?: string;
};

export function createGeminiProvider(
  options: GeminiProviderOptions = {},
): AiProvider {
  const model =
    options.model?.trim() ||
    getDefaultModelForProvider(
      "gemini",
    );

  const transport =
    createGeminiAiJsonTransport({
      model,
      apiKey: options.apiKey,
    });

  const resultProvider: AiProvider = {
    providerId: "gemini",
    model,

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const metadata =
        generatedJsonMetadata({
          provider: "gemini",
          model,
          schemaName:
            args.schemaName,
        });

      const generated =
        await transport.generateJsonText({
          system:
            strictJsonSystemPrompt(
              args.system,
            ),
          user: args.user,
          schemaName:
            args.schemaName,
        });

      let parsedJson: unknown;

      try {
        parsedJson =
          parseProviderJsonText<unknown>(
            generated.text,
          );
      } catch (error) {
        throw new Error(
          `Gemini returned invalid JSON for ${args.schemaName} with ${model}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }

      return buildGeneratedJsonResult<T>({
        metadata,
        rawText:
          generated.text,
        schemaName:
          args.schemaName,
        parsedJson,
      });
    },

    async generateJson<T>(
      args: GenerateJsonArgs,
    ): Promise<T> {
      const result =
        await resultProvider
          .generateJsonDetailed!<T>(
            args,
          );

      return result.value;
    },
  };

  return resultProvider;
}
