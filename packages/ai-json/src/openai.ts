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

type OpenAiFetchResponseLike = Readonly<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers?: Readonly<{ get(name: string): string | null }>;
  body?: ReadableStream<Uint8Array> | null;
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
    id?: unknown;
    output_text?: unknown;
    output?: readonly Readonly<{
      type?: unknown;
      summary?: readonly Readonly<{type?: unknown; text?: unknown}>[];
      content?: readonly Readonly<{
        type?: unknown;
        text?: unknown;
      }>[];
    }>[];
    /** Actual tier reported by Responses (may differ from requested tier). */
    service_tier?: unknown;
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

/** Extract only OpenAI's returned reasoning-summary items, never private reasoning content. */
function providerReasoningSummary(payload: OpenAiResponsePayload): string | undefined {
  const parts = (payload.output ?? []).filter(item => item.type === "reasoning")
    .flatMap(item => item.summary ?? [])
    .filter(item => item.type === "summary_text" && typeof item.text === "string")
    .map(item => String(item.text));
  const text = parts.join("\n").trim().slice(0, 12_000);
  return text || undefined;
}

/** Strict SSE parser: only summary deltas and the completed response are consumed. */
async function consumeOpenAiStream(
  response: OpenAiFetchResponseLike,
  onDelta?: (delta: string) => void,
): Promise<{payload: OpenAiResponsePayload; summary?: string}> {
  if (!response.body) throw new Error("AI_JSON_STREAM_BODY_MISSING");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let size = 0;
  let payload: OpenAiResponsePayload | null = null;
  let summary = "";
  const onEvent = (raw: string) => {
    const line = raw.split("\n").filter(part => part.startsWith("data:"))
      .map(part => part.slice(5).trimStart()).join("\n");
    if (!line || line === "[DONE]") return;
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === "response.reasoning_summary_text.delta" && typeof event.delta === "string") {
      if (summary.length < 12_000) {
        const delta = event.delta.slice(0, 12_000 - summary.length);
        summary += delta;
        onDelta?.(delta);
      }
    } else if (event.type === "response.completed" && event.response && typeof event.response === "object") {
      payload = event.response as OpenAiResponsePayload;
    } else if (event.type === "response.failed" || event.type === "response.incomplete") {
      throw new Error("AI_JSON_STREAM_INCOMPLETE");
    }
  };
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) throw new Error("AI_JSON_STREAM_TOO_LARGE");
      buffer += decoder.decode(value, {stream: true});
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        onEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) onEvent(buffer);
  } finally { reader.releaseLock(); }
  if (!payload) throw new Error("AI_JSON_STREAM_NO_COMPLETION");
  return {payload, summary: providerReasoningSummary(payload) ?? (summary.trim() || undefined)};
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

/** The SAME canonical user/system/schema envelope powers counting and generation. */
function openAiResponsesBody(model: string, request: AiJsonRequest) {
  const maxOutputTokens = boundedAiJsonOutputTokens(request);
  if (request.serviceTier !== undefined && request.serviceTier !== "default") {
    throw new Error("AI_JSON_SERVICE_TIER_UNSUPPORTED");
  }
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

  const summarySupported = /^(?:gpt-5|gpt-6|o[134])(?:[\w.-]|$)/i.test(model);
  const body = {
    model,
    ...(request.requestReasoningSummary === true && summarySupported ? {
      reasoning: {summary: "auto" as const},
    } : {}),
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
    // Metered GPT-6 Luna pricing currently covers only the 30-minute cache-write
    // rate. Pin that lifetime explicitly; 12-hour writes must not be introduced
    // until a separate reviewed and metered price category is supported.
    ...(model === "gpt-6-luna" ? {
      prompt_cache_options: { mode: "implicit" as const, ttl: "30m" as const },
    } : {}),
    ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
    ...(request.serviceTier === "default" ? {
      service_tier: "default" as const, truncation: "disabled" as const,
    } : {}),
  };
  return body;
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
  // Capture once: the token-count request, generated response, and billing
  // endpoint evidence cannot drift if a caller mutates options mid-request.
  const endpointBaseUrl = normalizedBaseURL(options.baseURL);
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
      billingEndpointBaseUrl: endpointBaseUrl,

      capabilities: {
        text: true,
        image: true,
        audio: false,
        video: false,
      },

      /** OpenAI Responses count endpoint: exact model/instructions/input/text envelope. */
      async countInputTokens(request: AiJsonRequest): Promise<number> {
        assertAiJsonMediaSupported(transport, request.media);
        if (request.media?.length) {
          throw new Error("AI_INPUT_COUNT_UNPRICED_MEDIA");
        }
        const body = openAiResponsesBody(model, {...request, requestReasoningSummary: false});
        // Generation-only options cannot change input tokenization. Keep the
        // same model/instructions/input/format and omit these count-only-unsupported fields.
        const { store: _store, max_output_tokens: _outputCap,
          prompt_cache_options: _cacheLifetime, service_tier: _serviceTier,
          truncation: _truncation, ...countBody } = body;
        const response = await resolveFetch(options.fetchImpl)(
          `${endpointBaseUrl}/responses/input_tokens`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${getApiKey(options.apiKey)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(countBody),
          },
        );
        const payload = JSON.parse(await response.text()) as Record<string, unknown>;
        if (!response.ok) throw new Error(`AI_INPUT_COUNT_PROVIDER_FAILED_${response.status}`);
        if (payload.object !== "response.input_tokens" ||
            !Number.isSafeInteger(payload.input_tokens) ||
            typeof payload.input_tokens !== "number" || payload.input_tokens < 1) {
          throw new Error("AI_INPUT_COUNT_INVALID_RESPONSE");
        }
        return payload.input_tokens;
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

        const body = openAiResponsesBody(model, request);
        if (request.clientRequestId !== undefined &&
            (typeof request.clientRequestId !== "string" ||
              !/^[\x21-\x7E]{1,160}$/.test(request.clientRequestId))) {
          throw new Error("AI_JSON_CLIENT_REQUEST_ID_INVALID");
        }

        const streaming = typeof request.onReasoningSummaryDelta === "function";
        const response =
          await fetchImpl(
            `${endpointBaseUrl}/responses`,
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${apiKey}`,
                "Content-Type":
                  "application/json",
                ...(request.clientRequestId === undefined ? {} : {
                  "X-Client-Request-Id": request.clientRequestId,
                }),
              },
              body:
                JSON.stringify(
                  streaming ? {...body, stream: true} : body,
                ),
            },
          );

        if (!response.ok) {
          const failure = parsePayload(await response.text());
          throw new Error(errorMessage(failure, response.status));
        }
        const streamed = streaming ? await consumeOpenAiStream(response, request.onReasoningSummaryDelta) : null;
        const payload = streamed?.payload ?? parsePayload(await response.text());

        return {
          usage: normalizeAiJsonUsage("openai", payload),
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
            serviceTier: typeof payload.service_tier === "string"
              ? payload.service_tier : undefined,
            providerResponseId: typeof payload.id === "string" ? payload.id : undefined,
            providerHttpRequestId: response.headers?.get("x-request-id") ?? undefined,
            reasoningSummary: streamed?.summary ?? providerReasoningSummary(payload),
          },
        };
      },
    };

  return transport;
}
