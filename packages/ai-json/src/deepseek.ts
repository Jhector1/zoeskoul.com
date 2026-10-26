import { normalizeAiJsonUsage } from "./usage";
import OpenAI from "openai";

import {
  AI_JSON_DEFAULT_TEMPERATURE,
  assertAiJsonMediaSupported,
  boundedAiJsonOutputTokens,
  type AiJsonMediaInput,
  type AiJsonRequest,
  type AiJsonTextResult,
  type AiJsonTransport,
} from "./index";

type DeepSeekClientLike = {
  chat: {
    completions: {
      create(
        args: unknown,
      ): Promise<unknown>;
    };
  };
};

export type DeepSeekAiJsonTransportOptions =
  Readonly<{
    model: string;
    apiKey?: string;
    baseURL?: string;
    clientFactory?: (
      args: Readonly<{
        apiKey: string;
        baseURL: string;
      }>,
    ) =>
      | DeepSeekClientLike
      | Promise<DeepSeekClientLike>;
  }>;

function getApiKey(
  apiKey?: string,
): string {
  const value =
    apiKey ??
    process.env.DEEPSEEK_API_KEY;

  if (!value?.trim()) {
    throw new Error(
      "Missing DEEPSEEK_API_KEY",
    );
  }

  return value.trim();
}

function getResponseText(
  response: any,
): string {
  const content =
    response?.choices?.[0]?.message
      ?.content;

  if (
    typeof content === "string" &&
    content.trim()
  ) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item: any) =>
        typeof item?.text ===
        "string"
          ? item.text
          : "",
      )
      .filter(Boolean)
      .join("");

    if (text.trim()) {
      return text;
    }
  }

  throw new Error(
    "DeepSeek returned no text content",
  );
}

async function createClient(
  options:
    DeepSeekAiJsonTransportOptions,
): Promise<DeepSeekClientLike> {
  const apiKey =
    getApiKey(options.apiKey);
  const baseURL =
    options.baseURL ??
    process.env.DEEPSEEK_BASE_URL ??
    "https://api.deepseek.com";

  if (options.clientFactory) {
    return await options.clientFactory({
      apiKey,
      baseURL,
    });
  }

  return new OpenAI({
    apiKey,
    baseURL,
  }) as unknown as DeepSeekClientLike;
}

function imageContentPart(
  media: AiJsonMediaInput,
): unknown {
  switch (media.source.type) {
    case "base64":
      return {
        type: "image_url",
        image_url: {
          url:
            `data:${media.mimeType};base64,${media.source.data}`,
        },
      };

    case "url":
      return {
        type: "image_url",
        image_url: {
          url:
            media.source.url,
        },
      };

    case "provider-file":
      return {
        type: "image_url",
        image_url: {
          file_id:
            media.source.providerRef,
        },
      };
  }
}

export function supportsDeepSeekImageInput(
  model: string,
): boolean {
  const normalized =
    model.trim().toLowerCase();

  return (
    normalized === "deepseek-flash" ||
    normalized ===
      "deepseek-v4-flash-vision-exp"
  );
}

export function createDeepSeekAiJsonTransport(
  options:
    DeepSeekAiJsonTransportOptions,
): AiJsonTransport {
  const model =
    options.model.trim();

  if (!model) {
    throw new Error(
      "DeepSeek model is required",
    );
  }

  const transport: AiJsonTransport = {
    providerId: "deepseek",
    model,
    capabilities: {
      text: true,
      image:
        supportsDeepSeekImageInput(
          model,
        ),
      audio: false,
      video: false,
    },

    async generateJsonText(
      request: AiJsonRequest,
    ): Promise<AiJsonTextResult> {
      assertAiJsonMediaSupported(
        transport,
        request.media,
      );
      const maxOutputTokens = boundedAiJsonOutputTokens(request);

      const userContent =
        request.media?.length
          ? [
              {
                type: "text",
                text: request.user,
              },
              ...request.media.map(
                imageContentPart,
              ),
            ]
          : request.user;

      const client =
        await createClient(options);

      const response =
        await client.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content: request.system,
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          response_format: {
            type: "json_object",
          },
          ...(maxOutputTokens === undefined ? {} : { max_tokens: maxOutputTokens }),
          temperature:
            AI_JSON_DEFAULT_TEMPERATURE,
        });

      return {
        usage: normalizeAiJsonUsage("deepseek", response),
        text:
          getResponseText(response),
        metadata: {
          provider: "deepseek",
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
