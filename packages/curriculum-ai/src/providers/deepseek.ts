import OpenAI from "openai";

import type { AiProvider, GenerateJsonArgs, GeneratedJsonResult } from "../types.js";
import {
  buildGeneratedJsonResult,
  generatedJsonMetadata,
  JSON_PROVIDER_DEFAULT_TEMPERATURE,
  parseProviderJsonText,
  strictJsonSystemPrompt,
} from "./jsonProviderUtils.js";
import { getDefaultModelForProvider } from "./providerCatalog.js";

export type DeepSeekProviderOptions = {
  model?: string;
  apiKey?: string;
  baseURL?: string;
};

function getDeepSeekApiKey(apiKey?: string): string {
  const value = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!value?.trim()) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }
  return value;
}

function getTextFromOpenAiCompatibleCompletion(response: any): string {
  const message = response?.choices?.[0]?.message;

  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content;
  }

  if (Array.isArray(message?.content)) {
    const text = message.content
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text ?? "")
      .join("");

    if (text.trim()) return text;
  }

  throw new Error("DeepSeek returned no text content");
}

export function createDeepSeekProvider(options: DeepSeekProviderOptions = {}): AiProvider {
  const model = options.model?.trim() || getDefaultModelForProvider("deepseek");
  const baseURL = options.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  const provider: AiProvider = {
    providerId: "deepseek",
    model,

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const client = new OpenAI({
        apiKey: getDeepSeekApiKey(options.apiKey),
        baseURL,
      });

      const metadata = generatedJsonMetadata({
        provider: "deepseek",
        model,
        schemaName: args.schemaName,
      });

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: strictJsonSystemPrompt(args.system) },
          { role: "user", content: args.user },
        ],
        response_format: { type: "json_object" },
        temperature: JSON_PROVIDER_DEFAULT_TEMPERATURE,
      } as any);

      const text = getTextFromOpenAiCompatibleCompletion(response);
      let parsedJson: unknown;

      try {
        parsedJson = parseProviderJsonText<unknown>(text);
      } catch (error) {
        throw new Error(
          `DeepSeek returned invalid JSON for ${args.schemaName} with ${model}: ${
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
