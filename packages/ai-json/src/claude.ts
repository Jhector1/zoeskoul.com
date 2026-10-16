import {
  AI_JSON_DEFAULT_TEMPERATURE,
  assertAiJsonMediaSupported,
  type AiJsonMediaInput,
  type AiJsonRequest,
  type AiJsonTextResult,
  type AiJsonTransport,
} from "./index";

type ClaudeClientLike = {
  messages: {
    create(
      args: unknown,
    ): Promise<unknown>;
  };
};

export type ClaudeAiJsonTransportOptions =
  Readonly<{
    model: string;
    apiKey?: string;
    clientFactory?: (
      apiKey: string,
    ) =>
      | ClaudeClientLike
      | Promise<ClaudeClientLike>;
  }>;

function getApiKey(
  apiKey?: string,
): string {
  const value =
    apiKey ??
    process.env.ANTHROPIC_API_KEY;

  if (!value?.trim()) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY",
    );
  }

  return value.trim();
}

function getResponseText(
  response: any,
): string {
  const content =
    Array.isArray(response?.content)
      ? response.content
      : [];

  const text = content
    .map((item: any) =>
      item?.type === "text"
        ? item.text ?? ""
        : "",
    )
    .filter(Boolean)
    .join("");

  if (text.trim()) {
    return text;
  }

  throw new Error(
    "Claude returned no text content",
  );
}

async function createClient(
  options:
    ClaudeAiJsonTransportOptions,
): Promise<ClaudeClientLike> {
  const apiKey =
    getApiKey(options.apiKey);

  if (options.clientFactory) {
    return await options.clientFactory(
      apiKey,
    );
  }

  const module =
    await import(
      "@anthropic-ai/sdk"
    );

  return new module.default({
    apiKey,
  }) as unknown as ClaudeClientLike;
}

function imageBlock(
  media: AiJsonMediaInput,
): unknown {
  switch (media.source.type) {
    case "base64":
      return {
        type: "image",
        source: {
          type: "base64",
          media_type:
            media.mimeType,
          data:
            media.source.data,
        },
      };

    case "url":
      return {
        type: "image",
        source: {
          type: "url",
          url:
            media.source.url,
        },
      };

    case "provider-file":
      return {
        type: "image",
        source: {
          type: "file",
          file_id:
            media.source.providerRef,
        },
      };
  }
}

export function createClaudeAiJsonTransport(
  options:
    ClaudeAiJsonTransportOptions,
): AiJsonTransport {
  const model =
    options.model.trim();

  if (!model) {
    throw new Error(
      "Claude model is required",
    );
  }

  const transport: AiJsonTransport = {
    providerId: "claude",
    model,
    capabilities: {
      text: true,
      image: true,
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

      const content = [
        ...(
          request.media ?? []
        ).map(imageBlock),
        {
          type: "text",
          text: request.user,
        },
      ];

      const client =
        await createClient(options);

      const response =
        await client.messages.create({
          model,
          max_tokens: 8192,
          temperature:
            AI_JSON_DEFAULT_TEMPERATURE,
          system: request.system,
          messages: [
            {
              role: "user",
              content,
            },
          ],
        });

      return {
        text:
          getResponseText(response),
        metadata: {
          provider: "claude",
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
