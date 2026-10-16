import {
  AI_JSON_DEFAULT_TEMPERATURE,
  assertAiJsonMediaSupported,
  type AiJsonMediaInput,
  type AiJsonRequest,
  type AiJsonTextResult,
  type AiJsonTransport,
} from "./index";

type OpenAiFetchResponseLike = Readonly<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type OpenAiFetchLike = (
  input: string,
  init?: Readonly<{
    method?: string;
    headers?: Readonly<Record<string, string>>;
    body?: string;
  }>,
) => Promise<OpenAiFetchResponseLike>;

export type OpenAiAiJsonTransportOptions =
  Readonly<{
    model: string;
    apiKey?: string;
    baseURL?: string;
    fetchImpl?: OpenAiFetchLike;
  }>;

type OpenAiResponsePayload =
  Readonly<{
    output_text?: unknown;
    output?: readonly Readonly<{
      type?: unknown;
      content?: readonly Readonly<{
        type?: unknown;
        text?: unknown;
      }>[];
    }>[];
    error?: Readonly<{
      message?: unknown;
      type?: unknown;
      code?: unknown;
    }>;
  }>;

function getApiKey(
  apiKey?: string,
): string {
  const value =
    apiKey ??
    process.env.OPENAI_API_KEY;

  if (!value?.trim()) {
    throw new Error(
      "Missing OPENAI_API_KEY",
    );
  }

  return value.trim();
}

function normalizedBaseURL(
  value?: string,
): string {
  return (
    value?.trim() ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
}

function resolveFetch(
  explicit?: OpenAiFetchLike,
): OpenAiFetchLike {
  if (explicit) {
    return explicit;
  }

  if (
    typeof globalThis.fetch !==
    "function"
  ) {
    throw new Error(
      "OpenAI transport requires global fetch. Use Node 18+.",
    );
  }

  return globalThis.fetch as unknown as
    OpenAiFetchLike;
}

function safeSchemaName(
  schemaName: string,
): string {
  const normalized =
    schemaName
      .trim()
      .replace(
        /[^A-Za-z0-9_-]+/g,
        "_",
      )
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);

  return (
    normalized ||
    "ZoeBuildJson"
  );
}

function imageContent(
  media: AiJsonMediaInput,
): Record<string, unknown> {
  if (media.kind !== "image") {
    throw new Error(
      `OpenAI image mapper received ${media.kind} media.`,
    );
  }

  switch (media.source.type) {
    case "base64":
      return {
        type: "input_image",
        detail: "auto",
        image_url:
          `data:${media.mimeType};base64,${media.source.data}`,
      };

    case "url":
      return {
        type: "input_image",
        detail: "auto",
        image_url:
          media.source.url,
      };

    case "provider-file":
      return {
        type: "input_image",
        detail: "auto",
        file_id:
          media.source.providerRef,
      };
  }
}

function responseText(
  payload: OpenAiResponsePayload,
): string {
  if (
    typeof payload.output_text ===
      "string" &&
    payload.output_text.trim()
  ) {
    return payload.output_text;
  }

  const parts =
    payload.output ?? [];

  const text =
    parts
      .flatMap(
        (item) =>
          item.type === "message" &&
          Array.isArray(
            item.content,
          )
            ? item.content
            : [],
      )
      .map(
        (content) =>
          content.type ===
            "output_text" &&
          typeof content.text ===
            "string"
            ? content.text
            : "",
      )
      .filter(Boolean)
      .join("");

  if (text.trim()) {
    return text;
  }

  throw new Error(
    "OpenAI returned no text content",
  );
}

function parsePayload(
  raw: string,
): OpenAiResponsePayload {
  try {
    return JSON.parse(
      raw,
    ) as OpenAiResponsePayload;
  } catch {
    throw new Error(
      "OpenAI returned a non-JSON API response.",
    );
  }
}

function errorMessage(
  payload: OpenAiResponsePayload,
  status: number,
): string {
  const message =
    payload.error &&
    typeof payload.error.message ===
      "string"
      ? payload.error.message.trim()
      : "";

  return message
    ? `OpenAI Responses API request failed (${status}): ${message}`
    : `OpenAI Responses API request failed (${status}).`;
}

/**
 * Provider-neutral OpenAI JSON transport.
 *
 * ZoeBuild uses the Responses API for text/image planning and Structured
 * Outputs. Audio and video deliberately remain unsupported here; they must be
 * normalized before this transport in a future preprocessing layer.
 */
export function createOpenAiJsonTransport(
  options:
    OpenAiAiJsonTransportOptions,
): AiJsonTransport {
  const model =
    options.model.trim();

  if (!model) {
    throw new Error(
      "OpenAI model is required",
    );
  }

  const transport:
    AiJsonTransport = {
      providerId: "openai",
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

        const apiKey =
          getApiKey(
            options.apiKey,
          );

        const fetchImpl =
          resolveFetch(
            options.fetchImpl,
          );

        const content:
          Record<string, unknown>[] =
          [];

        if (request.user.trim()) {
          content.push({
            type: "input_text",
            text: request.user,
          });
        }

        for (
          const media of
          request.media ?? []
        ) {
          content.push(
            imageContent(media),
          );
        }

        if (
          content.length === 0
        ) {
          throw new Error(
            "OpenAI request requires text or image input.",
          );
        }

        const format =
          request.responseJsonSchema
            ? {
                type:
                  "json_schema",
                name:
                  safeSchemaName(
                    request.schemaName,
                  ),
                strict: true,
                schema:
                  request.responseJsonSchema,
              }
            : {
                type:
                  "json_object",
              };

        const body = {
          model,
          instructions:
            request.system,
          input: [
            {
              role: "user",
              content,
            },
          ],
          text: {
            format,
          },
          store: false,
        };

        const response =
          await fetchImpl(
            `${normalizedBaseURL(
              options.baseURL,
            )}/responses`,
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${apiKey}`,
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  body,
                ),
            },
          );

        const raw =
          await response.text();

        const payload =
          parsePayload(raw);

        if (!response.ok) {
          throw new Error(
            errorMessage(
              payload,
              response.status,
            ),
          );
        }

        return {
          text:
            responseText(
              payload,
            ),
          metadata: {
            provider: "openai",
            model,

            // Compatibility metadata only. We intentionally do not send
            // temperature to reasoning models such as GPT-6.1 Sol.
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
