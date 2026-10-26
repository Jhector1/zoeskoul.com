import { normalizeAiJsonUsage } from "./usage";
import {
  AI_JSON_DEFAULT_TEMPERATURE,
  assertAiJsonMediaSupported,
  boundedAiJsonOutputTokens,
  type AiJsonMediaInput,
  type AiJsonRequest,
  type AiJsonTextResult,
  type AiJsonTransport,
} from "./index";

type GeminiClientLike = {
  models: {
    generateContent(
      args: unknown,
    ): Promise<unknown>;
  };
};

export type GeminiAiJsonTransportOptions =
  Readonly<{
    model: string;
    apiKey?: string;
    clientFactory?: (
      apiKey: string,
    ) =>
      | GeminiClientLike
      | Promise<GeminiClientLike>;
  }>;

function getApiKey(
  apiKey?: string,
): string {
  const value =
    apiKey ??
    process.env.GEMINI_API_KEY;

  if (!value?.trim()) {
    throw new Error(
      "Missing GEMINI_API_KEY",
    );
  }

  return value.trim();
}

function getResponseText(
  response: any,
): string {
  if (
    typeof response?.text ===
    "string"
  ) {
    return response.text;
  }

  if (
    typeof response?.text ===
    "function"
  ) {
    const text = response.text();
    if (typeof text === "string") {
      return text;
    }
  }

  const parts =
    response?.candidates?.flatMap(
      (candidate: any) =>
        candidate?.content?.parts ?? [],
    ) ?? [];

  const text = parts
    .map(
      (part: any) =>
        part?.text ?? "",
    )
    .filter(Boolean)
    .join("");

  if (text.trim()) {
    return text;
  }

  throw new Error(
    "Gemini returned no text content",
  );
}

async function createClient(
  options:
    GeminiAiJsonTransportOptions,
): Promise<GeminiClientLike> {
  const apiKey =
    getApiKey(options.apiKey);

  if (options.clientFactory) {
    return await options.clientFactory(
      apiKey,
    );
  }

  const {
    GoogleGenAI,
  } = await import("@google/genai");

  return new GoogleGenAI({
    apiKey,
  }) as unknown as GeminiClientLike;
}

function mediaPart(
  media: AiJsonMediaInput,
): unknown {
  switch (media.source.type) {
    case "base64":
      return {
        inlineData: {
          mimeType: media.mimeType,
          data: media.source.data,
        },
      };

    case "url":
      return {
        fileData: {
          mimeType: media.mimeType,
          fileUri: media.source.url,
        },
      };

    case "provider-file":
      return {
        fileData: {
          mimeType: media.mimeType,
          fileUri:
            media.source.providerRef,
        },
      };
  }
}

export function createGeminiAiJsonTransport(
  options:
    GeminiAiJsonTransportOptions,
): AiJsonTransport {
  const model =
    options.model.trim();

  if (!model) {
    throw new Error(
      "Gemini model is required",
    );
  }

  const transport: AiJsonTransport = {
    providerId: "gemini",
    model,
    capabilities: {
      text: true,
      image: true,
      audio: true,
      video: true,
    },

    async generateJsonText(
      request: AiJsonRequest,
    ): Promise<AiJsonTextResult> {
      assertAiJsonMediaSupported(
        transport,
        request.media,
      );
      const maxOutputTokens = boundedAiJsonOutputTokens(request);

      const client =
        await createClient(options);

      const userParts = [
        {
          text: request.user,
        },
        ...(
          request.media ?? []
        ).map(mediaPart),
      ];

      const response =
        await client.models.generateContent({
          model,
          systemInstruction:
            request.system,
          contents: [
            {
              role: "user",
              parts: userParts,
            },
          ],
          config: {
            responseMimeType:
              "application/json",
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            ...(request.responseJsonSchema
              ? {
                  responseJsonSchema:
                    request.responseJsonSchema,
                }
              : {}),
            temperature:
              AI_JSON_DEFAULT_TEMPERATURE,
          },
        });

      return {
        usage: normalizeAiJsonUsage("gemini", response),
        text:
          getResponseText(response),
        metadata: {
          provider: "gemini",
          model,
          temperature:
            AI_JSON_DEFAULT_TEMPERATURE,
          schemaName:
            request.schemaName,
        },
      };
    },
  };

  return transport;
}
