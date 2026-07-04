import type { AiProvider, GenerateJsonArgs, GeneratedJsonResult } from "../types.js";
import {
  buildGeneratedJsonResult,
  generatedJsonMetadata,
  JSON_PROVIDER_DEFAULT_TEMPERATURE,
  parseProviderJsonText,
  strictJsonSystemPrompt,
} from "./jsonProviderUtils.js";
import { getDefaultModelForProvider } from "./providerCatalog.js";

export type GeminiProviderOptions = {
  model?: string;
  apiKey?: string;
};

function getGeminiApiKey(apiKey?: string): string {
  const value = apiKey ?? process.env.GEMINI_API_KEY;
  if (!value?.trim()) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  return value;
}

function getTextFromGeminiResponse(response: any): string {
  if (typeof response?.text === "string") return response.text;
  if (typeof response?.text === "function") {
    const text = response.text();
    if (typeof text === "string") return text;
  }

  const parts = response?.candidates?.flatMap((candidate: any) =>
    candidate?.content?.parts ?? [],
  ) ?? [];
  const text = parts
    .map((part: any) => part?.text ?? "")
    .filter(Boolean)
    .join("");

  if (text.trim()) return text;

  throw new Error("Gemini returned no text content");
}

export function createGeminiProvider(options: GeminiProviderOptions = {}): AiProvider {
  const model = options.model?.trim() || getDefaultModelForProvider("gemini");

  const provider: AiProvider = {
    providerId: "gemini",
    model,

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: getGeminiApiKey(options.apiKey) });
      const metadata = generatedJsonMetadata({
        provider: "gemini",
        model,
        schemaName: args.schemaName,
      });

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  strictJsonSystemPrompt(args.system),
                  "",
                  args.user,
                ].join("\n"),
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: JSON_PROVIDER_DEFAULT_TEMPERATURE,
        },
      } as any);

      const text = getTextFromGeminiResponse(response);
      let parsedJson: unknown;

      try {
        parsedJson = parseProviderJsonText<unknown>(text);
      } catch (error) {
        throw new Error(
          `Gemini returned invalid JSON for ${args.schemaName} with ${model}: ${
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
