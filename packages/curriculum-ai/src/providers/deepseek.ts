import {
  createDeepSeekAiJsonTransport,
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

export type DeepSeekProviderOptions = {
  model?: string;
  apiKey?: string;
  baseURL?: string;
};

export function createDeepSeekProvider(
  options: DeepSeekProviderOptions = {},
): AiProvider {
  const model =
    options.model?.trim() ||
    getDefaultModelForProvider(
      "deepseek",
    );

  const transport =
    createDeepSeekAiJsonTransport({
      model,
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });

  const resultProvider: AiProvider = {
    providerId: "deepseek",
    model,

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const metadata =
        generatedJsonMetadata({
          provider: "deepseek",
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
          `DeepSeek returned invalid JSON for ${args.schemaName} with ${model}: ${
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
