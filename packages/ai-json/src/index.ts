export const AI_JSON_DEFAULT_TEMPERATURE = 0;

export type AiJsonMediaKind =
  | "image"
  | "audio"
  | "video";

export type AiJsonMediaSource =
  | Readonly<{
      type: "base64";
      data: string;
    }>
  | Readonly<{
      type: "url";
      url: string;
    }>
  | Readonly<{
      type: "provider-file";
      providerRef: string;
    }>;

export type AiJsonMediaInput = Readonly<{
  kind: AiJsonMediaKind;
  mimeType: string;
  name?: string;
  source: AiJsonMediaSource;
}>;

export type AiJsonRequest = Readonly<{
  system: string;
  user: string;
  schemaName: string;
  responseJsonSchema?: Readonly<
    Record<string, unknown>
  >;
  media?: readonly AiJsonMediaInput[];
}>;

export type AiJsonTransportCapabilities =
  Readonly<{
    text: true;
    image: boolean;
    audio: boolean;
    video: boolean;
  }>;

export type AiJsonTransportMetadata =
  Readonly<{
    provider: string;
    model: string;
    temperature: number;
    schemaName: string;
  }>;

export type AiJsonTextResult = Readonly<{
  text: string;
  metadata: AiJsonTransportMetadata;
}>;

export class AiJsonUnsupportedModalityError
  extends Error {
  readonly code =
    "AI_JSON_UNSUPPORTED_MODALITY" as const;

  constructor(
    readonly providerId: string,
    readonly kind: AiJsonMediaKind,
  ) {
    super(
      `${providerId} does not support ${kind} input.`,
    );
    this.name =
      "AiJsonUnsupportedModalityError";
  }
}

export interface AiJsonTransport {
  readonly providerId: string;
  readonly model: string;
  readonly capabilities:
    AiJsonTransportCapabilities;

  generateJsonText(
    request: AiJsonRequest,
  ): Promise<AiJsonTextResult>;
}

export function assertAiJsonMediaSupported(
  transport: Pick<
    AiJsonTransport,
    "providerId" | "capabilities"
  >,
  media:
    readonly AiJsonMediaInput[] =
      [],
): void {
  for (const item of media) {
    if (!transport.capabilities[item.kind]) {
      throw new AiJsonUnsupportedModalityError(
        transport.providerId,
        item.kind,
      );
    }
  }
}

export function stripAiJsonCodeFences(
  text: string,
): string {
  const trimmed = text.trim();

  if (
    trimmed.startsWith("```") &&
    trimmed.endsWith("```")
  ) {
    return trimmed
      .replace(
        /^```(?:json)?\s*/i,
        "",
      )
      .replace(/\s*```$/, "")
      .trim();
  }

  return trimmed;
}

export function parseAiJsonText<T>(
  text: string,
): T {
  const cleaned =
    stripAiJsonCodeFences(text);

  if (!cleaned) {
    throw new Error(
      "AI provider returned empty JSON text.",
    );
  }

  return JSON.parse(cleaned) as T;
}

export {
  createGeminiAiJsonTransport,
  type GeminiAiJsonTransportOptions,
} from "./gemini";

export {
  createClaudeAiJsonTransport,
  type ClaudeAiJsonTransportOptions,
} from "./claude";

export {
  createDeepSeekAiJsonTransport,
  type DeepSeekAiJsonTransportOptions,
} from "./deepseek";

export {
  createOpenAiJsonTransport,
  type OpenAiAiJsonTransportOptions,
} from "./openai";
