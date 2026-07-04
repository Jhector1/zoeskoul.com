import type { AiProvider, GenerateJsonArgs, GeneratedJsonResult } from "../types.js";
import {
  buildGeneratedJsonResult,
  generatedJsonMetadata,
  JSON_PROVIDER_DEFAULT_TEMPERATURE,
  parseProviderJsonText,
  strictJsonSystemPrompt,
} from "./jsonProviderUtils.js";
import { getDefaultModelForProvider } from "./providerCatalog.js";

export type ClaudeProviderOptions = {
  model?: string;
  apiKey?: string;
};

function getClaudeApiKey(apiKey?: string): string {
  const value = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!value?.trim()) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return value;
}

function getTextFromClaudeResponse(response: any): string {
  const text = (response?.content ?? [])
    .filter((part: any) => part?.type === "text")
    .map((part: any) => part.text ?? "")
    .join("");

  if (text.trim()) return text;

  throw new Error("Claude returned no text content");
}

export function createClaudeProvider(options: ClaudeProviderOptions = {}): AiProvider {
  const model = options.model?.trim() || getDefaultModelForProvider("claude");

  const provider: AiProvider = {
    providerId: "claude",
    model,

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: getClaudeApiKey(options.apiKey) });
      const metadata = generatedJsonMetadata({
        provider: "claude",
        model,
        schemaName: args.schemaName,
      });

      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        temperature: JSON_PROVIDER_DEFAULT_TEMPERATURE,
        system: strictJsonSystemPrompt(args.system),
        messages: [{ role: "user", content: args.user }],
      } as any);

      const text = getTextFromClaudeResponse(response);
      let parsedJson: unknown;

      try {
        parsedJson = parseProviderJsonText<unknown>(text);
      } catch (error) {
        throw new Error(
          `Claude returned invalid JSON for ${args.schemaName} with ${model}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      return buildGeneratedJsonResult<T>({
        metadata,
        rawText: text,
        parsedJson,
        schemaName: args.schemaName,
      });
    },

    async generateJson<T>(args: GenerateJsonArgs): Promise<T> {
      const result = await provider.generateJsonDetailed!<T>(args);
      return result.value;
    },
  };

  return provider;
}
