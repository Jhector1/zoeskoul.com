export const AI_JSON_DEFAULT_TEMPERATURE = 0;

/** Conservative transport-level ceiling, not a model-specific token allowance. */
export const AI_JSON_MAX_OUTPUT_TOKENS = 16_384;

/** Reject invalid limits before any provider call or paid operation. */
export function boundedAiJsonOutputTokens(request: AiJsonRequest): number | undefined {
  const value = request.maxOutputTokens;
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > AI_JSON_MAX_OUTPUT_TOKENS) {
    throw new Error("AI_JSON_OUTPUT_LIMIT_INVALID");
  }
  return value;
}

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
  /** Enforced by providers; mandatory for credit-metered requests. */
  maxOutputTokens?: number;
  /** Optional OpenAI Standard-tier pin. Metered execution forces this server-side. */
  serviceTier?: "default";
  /** Server-owned trace ID used only for the paid generation HTTP request. */
  clientRequestId?: string;
  /** Request only a provider-supplied reasoning SUMMARY; never private chain of thought. */
  requestReasoningSummary?: boolean;
  /** Invoked with actual OpenAI summary deltas, when supported. Not JSON-serializable. */
  onReasoningSummaryDelta?: (delta: string) => void;
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
    /** Actual provider-reported service tier, not caller-requested. */
    serviceTier?: string;
    /** HTTPS Responses JSON id. A provider claim is not independent billing proof. */
    providerResponseId?: string;
    /** HTTPS x-request-id header, if received. */
    providerHttpRequestId?: string;
    /** Provider-produced explanation (not raw reasoning), when present. */
    reasoningSummary?: string;
  }>;

export type { AiJsonUsage } from "./usage";

export type AiJsonTextResult = Readonly<{
  usage?: import("./usage").AiJsonUsage | null;
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

  /** Optional provider-side preflight. Must count this SAME transport request. */
  countInputTokens?(request: AiJsonRequest): Promise<number>;

  /**
   * First-party transport's ACTUAL endpoint base captured at construction.
   * Billing uses this only for fail-closed endpoint eligibility checks.
   * It is not a geographic processing attestation from the provider.
   */
  readonly billingEndpointBaseUrl?: string;
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

// V12J.16E: confirm actual OpenAI TTL categories before 30m priced settlement.
export { assertOpenAi30mCacheBilling, OpenAi30mCacheBillingError } from "./openAi30mCacheBilling";

// E16C4A: deterministic pricing is shared by trusted server-side executors.
export {
  priceAiJsonUsage,
  AiPricingError,
  type AiPricingVersion,
  type AiPricedUsage,
} from "./pricing";

// E16C4D1 pure nanodollar bound math: NOT a provider token-limit proof.
export {
  calculateAiTextTokenCeiling, AiTextTokenCeilingError,
  type AiTextTokenCeilingInput, type AiTextTokenCeiling,
} from "./textTokenCeiling";

// E16C4D4A/B: payload-byte preflight, not a provider token-billing guarantee.
export {
  assertAiJsonInputEnvelope, AiJsonInputEnvelopeError,
  type AiJsonInputEnvelope,
} from "./aiJsonInputEnvelope";
