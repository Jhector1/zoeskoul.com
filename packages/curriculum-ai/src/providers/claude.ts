import {
  createClaudeAiJsonTransport,
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

export type ClaudeProviderOptions = {
  model?: string;
  apiKey?: string;
};

export function createClaudeProvider(
  options: ClaudeProviderOptions = {},
): AiProvider {
  const model =
    options.model?.trim() ||
    getDefaultModelForProvider(
      "claude",
    );

  const transport =
    createClaudeAiJsonTransport({
      model,
      apiKey: options.apiKey,
    });

  const resultProvider: AiProvider = {
    providerId: "claude",
    model,

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const metadata =
        generatedJsonMetadata({
          provider: "claude",
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
          `Claude returned invalid JSON for ${args.schemaName} with ${model}: ${
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
