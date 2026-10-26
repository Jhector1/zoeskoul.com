import type { PrismaClient } from "@zoeskoul/db";
import { createHash, randomUUID } from "node:crypto";
import {
  priceAiJsonUsage,
  assertOpenAi30mCacheBilling,
  boundedAiJsonOutputTokens,
  assertAiJsonInputEnvelope,
  type AiJsonRequest,
  type AiJsonTextResult,
  type AiJsonTransport,
  type AiJsonUsage,
  type AiPricingVersion,
} from "@zoeskoul/ai-json";
import {
  reserveAiCredits,
  settleAiCredits,
} from "@zoeskoul/platform-server/ai-credits/ledger";
import type { AiCreditConversion } from "@zoeskoul/platform-server/ai-credits/math";
import { recordUncertainAiCreditCharge } from "@zoeskoul/platform-server/ai-credits/reconciliation";
import type { AiCreditResultJournal } from "./aiCreditResultJournal";
import { bindAiCreditProviderRequest, captureAiCreditProviderResponse,
  recordAiCreditPricedProviderReceipt }
  from "@zoeskoul/platform-server/ai-credits/provider-request";

/**
 * E16C4A: server-only metered dispatch primitive.
 * Do NOT expose this configuration through browser input or AI output.
 * Live route wiring requires verified provider rates and hard output budgets.
 */
export type MeteredAiJsonExecution = Readonly<{
  transport: AiJsonTransport;
  request: AiJsonRequest;
  client: PrismaClient;
  userId: string;
  idempotencyKey: string;
  pricingCatalog: readonly AiPricingVersion[];
  pricingVersionId: string;
  conversion: AiCreditConversion;
  maximumUnits: string;
  /** Server-reviewed ceiling on the SAME provider request input tokens. */
  maxCombinedInputTokens: number;
  /** Must equal the provider-enforced max_output_tokens, including reasoning. */
  maxBillableOutputTokens: number;
  occurredAt?: Date;
  /** Required by route-level paid execution; optional only for legacy unit consumers.
   * Every production required-mode call supplies the canonical durable journal. */
  resultJournal?: AiCreditResultJournal;
}>;

export class MeteredAiJsonError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = "MeteredAiJsonError";
  }
}

/** Fixed platform text/schema PAYLOAD byte cap. NOT a billable-token upper bound.
 * A reviewed per-model tokenizer/guarantee is still required for live charges.
 */
export const MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES = 64 * 1024;

/** Global Standard price review ONLY. Regional/FedRAMP/custom hosts may cost more. */
export const METERED_OPENAI_GLOBAL_ENDPOINT = "https://api.openai.com/v1";

const PROVIDERS = ["openai", "gemini", "claude", "deepseek"] as const;
function supportedProvider(value: string): AiJsonUsage["provider"] {
  if (!PROVIDERS.some((id) => id === value)) {
    throw new MeteredAiJsonError("AI_METERING_PROVIDER_UNSUPPORTED");
  }
  return value as AiJsonUsage["provider"];
}
function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) {
    throw new MeteredAiJsonError(`AI_METERING_INVALID_${label}`);
  }
  return trimmed;
}

/**
 * Do not return a generated result until the actual provider usage is
 * deterministically priced AND the existing wallet reservation is settled.
 * Missing usage, provider failure or settlement failure deliberately retains
 * the reservation for separate reconciliation; never assume a free request.
 */
export async function executeMeteredAiJsonRequest(
  input: MeteredAiJsonExecution,
): Promise<AiJsonTextResult> {
  const userId = required(input.userId, "USER");
  const idempotencyKey = required(input.idempotencyKey, "KEY");
  const pricingVersionId = required(input.pricingVersionId, "PRICING_VERSION");
  const provider = supportedProvider(input.transport.providerId);
  const model = required(input.transport.model, "MODEL");
  // The API max_output_tokens covers both visible and reasoning output.
  // A separately declared larger billable ceiling cannot be enforced by this
  // transport. Refuse it before any wallet reservation or provider call.
  const enforcedOutputLimit = boundedAiJsonOutputTokens(input.request);
  if (enforcedOutputLimit === undefined) {
    throw new MeteredAiJsonError("AI_METERING_OUTPUT_LIMIT_REQUIRED");
  }
  if (!Number.isSafeInteger(input.maxBillableOutputTokens) ||
      input.maxBillableOutputTokens !== enforcedOutputLimit) {
    throw new MeteredAiJsonError("AI_METERING_BILLABLE_OUTPUT_CAP_UNVERIFIED");
  }
  const now = input.occurredAt ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new MeteredAiJsonError("AI_METERING_INVALID_TIME");
  }
  if (input.request.media?.length) {
    // E16C2 does not price images/audio/video or multimodal tool fees.
    throw new MeteredAiJsonError("AI_METERING_MULTIMODAL_NOT_PRICED");
  }
  // Validate the COMPLETE caller-controlled text + JSON schema immediately before
  // wallet reservation. This guard rejects oversized/invalid payloads; it does
  // NOT authorize credit spending based on bytes or predict provider token fees.
  assertAiJsonInputEnvelope(input.request, MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES);
  // Snapshot the exact checked text/schema synchronously, so another callback
  // cannot enlarge/change it while the asynchronous wallet lock is held.
  // Deliberately do not forward unrecognized fields or unpriced media.
  const requestToDispatch: AiJsonRequest = {
    // Force Standard pricing at the authoritative server boundary. Never
    // inherit Project-level Fast/Flex/Ultrafast defaults or client tier hints.
    serviceTier: "default",
    system: input.request.system,
    user: input.request.user,
    schemaName: input.request.schemaName,
    maxOutputTokens: input.request.maxOutputTokens,
    ...(input.request.responseJsonSchema === undefined ? {} : {
      responseJsonSchema: JSON.parse(JSON.stringify(input.request.responseJsonSchema)) as NonNullable<AiJsonRequest["responseJsonSchema"]>,
    }),
  };
  // Validate matching, uniquely effective pricing and the full rate map BEFORE
  // acquiring credits or contacting the provider. Synthetic ZERO usage is used
  // only for price-catalog validation, never for charging an actual request.
  const verifiedVersion = priceAiJsonUsage({
    usage: {
      provider, inputTokens: 0, outputTokens: 0,
      cachedInputTokens: provider === "openai" ? 0 : null,
      cacheWriteInputTokens: provider === "openai" ? 0 : null,
      reasoningOutputTokens: null, providerRaw: {},
    },
    provider, model, occurredAt: now.toISOString(),
    catalog: input.pricingCatalog,
  });
  if (verifiedVersion.pricingVersionId !== pricingVersionId) {
    throw new MeteredAiJsonError("AI_METERING_PRICE_SNAPSHOT_MISMATCH");
  }

  // Only the canonical global API endpoint is in the reviewed Standard-rate
  // scope. Regional, FedRAMP, proxy and custom hosts require SEPARATE pricing
  // and residency reviews; the processing tier alone does not prove geography.
  // This property is captured by our first-party transport at construction.
  if (provider === "openai" &&
      input.transport.billingEndpointBaseUrl !== METERED_OPENAI_GLOBAL_ENDPOINT) {
    throw new MeteredAiJsonError("AI_METERING_PROCESSING_REGION_UNVERIFIED");
  }
  // D5A: OpenAI has a provider input-count endpoint that accepts the same
  // Responses envelope. Other provider token counts are not certified by this
  // integration; never convert estimates to spend permission.
  if (provider !== "openai" || typeof input.transport.countInputTokens !== "function") {
    throw new MeteredAiJsonError("AI_METERING_INPUT_COUNT_UNVERIFIED");
  }
  if (!Number.isSafeInteger(input.maxCombinedInputTokens) || input.maxCombinedInputTokens < 1) {
    throw new MeteredAiJsonError("AI_METERING_INPUT_CEILING_INVALID");
  }
  let providerCount: number;
  try {
    providerCount = await input.transport.countInputTokens(requestToDispatch);
  } catch (error) {
    throw new MeteredAiJsonError("AI_METERING_INPUT_COUNT_FAILED", { cause: error });
  }
  if (!Number.isSafeInteger(providerCount) || providerCount < 1) {
    throw new MeteredAiJsonError("AI_METERING_INPUT_COUNT_INVALID");
  }
  if (providerCount > input.maxCombinedInputTokens) {
    throw new MeteredAiJsonError("AI_METERING_INPUT_CEILING_EXCEEDED");
  }

  const requestSha256 = createHash("sha256")
    .update(JSON.stringify({provider,model,request:requestToDispatch})).digest("hex");
  const reservation = await reserveAiCredits({
    client: input.client, userId, idempotencyKey,
    maximumUnits: input.maximumUnits,
    pricingVersionId,
    conversion: input.conversion,
    now,
  });
  if (!reservation.created || reservation.status !== "reserved") {
    // Never re-dispatch. Recover ONLY from the encrypted result tied to a
    // server-captured provider receipt and confirmed canonical settlement.
    if (input.resultJournal) {
      try {
        const recovered = await input.resultJournal.restore({
          userId,idempotencyKey,requestSha256,
        });
        if (recovered) return recovered;
      } catch (error) {
        throw new MeteredAiJsonError("AI_METERING_REPLAY_REVIEW_REQUIRED", {cause:error});
      }
    }
    throw new MeteredAiJsonError("AI_METERING_ALREADY_RESERVED");
  }

  // The charge journal cannot alter financial state. If it fails, keep the
  // original held reservation and error; an aged-reservation scan finds it.
  async function journalHeld(reason: "AI_METERING_PROVIDER_OUTCOME_UNKNOWN" |
      "AI_METERING_SETTLEMENT_PENDING") {
    try {
      await recordUncertainAiCreditCharge({
        client: input.client, userId, idempotencyKey, reason,
      });
    } catch {
      // Never release a reservation or hide the original metering failure.
    }
  }

  // Bind the outbound trace ID durably before any paid generation request.
  // If this write fails, HOLD the wallet reservation and dispatch nothing.
  const clientRequestId = `zb-${randomUUID()}`;
  try {
    await bindAiCreditProviderRequest({
      client: input.client, userId, reservationId: reservation.id, idempotencyKey,
      provider: "openai", model, clientRequestId, requestSha256,
    });
  } catch (error) {
    await journalHeld("AI_METERING_SETTLEMENT_PENDING");
    throw new MeteredAiJsonError("AI_METERING_PROVIDER_BINDING_FAILED", { cause: error });
  }
  const boundRequest: AiJsonRequest = { ...requestToDispatch, clientRequestId };

  let output: AiJsonTextResult;
  try {
    output = await input.transport.generateJsonText(boundRequest);
  } catch (error) {
    // A transport error may happen AFTER provider billing. Hold funds.
    await journalHeld("AI_METERING_PROVIDER_OUTCOME_UNKNOWN");
    throw new MeteredAiJsonError("AI_METERING_PROVIDER_OUTCOME_UNKNOWN", { cause: error });
  }
  try {
    if (typeof output.metadata?.providerResponseId !== "string") {
      throw new MeteredAiJsonError("AI_METERING_PROVIDER_RESPONSE_ID_MISSING");
    }
    // Persist HTTPS-origin response identifiers BEFORE possible financial settlement.
    // A missing/failed capture keeps the reservation held for independent review.
    await captureAiCreditProviderResponse({
      client: input.client, userId, reservationId: reservation.id, clientRequestId,
      providerResponseId: output.metadata.providerResponseId,
      ...(output.metadata.providerHttpRequestId === undefined ? {} : {
        providerHttpRequestId: output.metadata.providerHttpRequestId,
      }),
    });
    if (!output.usage || output.usage.provider !== provider ||
        output.metadata.provider !== provider || output.metadata.model !== model) {
      throw new MeteredAiJsonError("AI_METERING_USAGE_OR_MODEL_MISMATCH");
    }
    // OpenAI may return a different actual tier than requested. Never settle a
    // Standard-rate credit price against Fast/Ultrafast or an unknown tier.
    if (output.metadata.serviceTier !== "default") {
      throw new MeteredAiJsonError("AI_METERING_PROVIDER_TIER_UNVERIFIED");
    }
    // A higher billed-input total than the provider preflight promised is an
    // uncertain cost. Hold reservation for reconciliation; never undercharge.
    if (output.usage.inputTokens > input.maxCombinedInputTokens) {
      throw new MeteredAiJsonError("AI_METERING_INPUT_COUNT_MISMATCH");
    }
    // Never settle usage outside the server-reserved generation bound.
    // The OpenAI cap includes hidden reasoning tokens; reasoning is a subset
    // of output_tokens, not an extra priced output category.
    const outputTokens = output.usage.outputTokens;
    const reasoningTokens = output.usage.reasoningOutputTokens;
    if (!Number.isSafeInteger(outputTokens) || outputTokens < 0 ||
        outputTokens > input.maxBillableOutputTokens ||
        (reasoningTokens !== null &&
          (!Number.isSafeInteger(reasoningTokens) || reasoningTokens < 0 ||
            reasoningTokens > outputTokens))) {
      throw new MeteredAiJsonError("AI_METERING_OUTPUT_USAGE_OUTSIDE_RESERVATION");
    }
    if (output.usage.inputTokens === 0 && output.usage.outputTokens === 0) {
      throw new MeteredAiJsonError("AI_METERING_EMPTY_USAGE");
    }
    // Only OpenAI reaches this point: all other providers, including Gemini
    // thinking-token billing, fail closed before any credit reservation.
    // V12J.16E: the provider's actual cache-write TTL breakdown, not only
    // the request's 30m setting, must match the one-rate billing policy.
    // A 12h write or unverified positive write keeps the reservation held.
    assertOpenAi30mCacheBilling(output.usage);
    const priced = priceAiJsonUsage({
      usage: output.usage, provider, model,
      occurredAt: now.toISOString(), catalog: input.pricingCatalog,
    });
    if (priced.pricingVersionId !== pricingVersionId) {
      throw new MeteredAiJsonError("AI_METERING_PRICE_SNAPSHOT_MISMATCH");
    }
    // Only after every tier/usage/price/ceiling check, preserve a trusted
    // original-response receipt BEFORE trying the financial transaction.
    // A failure here retains the hold; it never makes a claim of zero usage.
    const usageSha256 = createHash("sha256")
      .update(JSON.stringify({ provider, model, clientRequestId,
        providerResponseId: output.metadata.providerResponseId,
        usage: output.usage, pricingVersionId: priced.pricingVersionId,
        costUsdNano: priced.costUsdNano }))
      .digest("hex");
    await recordAiCreditPricedProviderReceipt({
      client: input.client, userId, reservationId: reservation.id, clientRequestId,
      providerResponseId: output.metadata.providerResponseId,
      pricingVersionId: priced.pricingVersionId, costUsdNano: priced.costUsdNano,
      usageSha256,
    });
    // Persist the authenticated provider output BEFORE money settlement. If
    // settlement crashes, an identical retry can recover the original receipt
    // and output without issuing a second provider request.
    if (input.resultJournal) {
      await input.resultJournal.preserve({
        userId,idempotencyKey,requestSha256,reservationId:reservation.id,
        clientRequestId,providerResponseId:output.metadata.providerResponseId,
        pricingVersionId:priced.pricingVersionId,result:output,
      });
    }
    await settleAiCredits({
      client: input.client, userId, idempotencyKey,
      pricedUsage: {
        pricingVersionId: priced.pricingVersionId,
        costUsdNano: priced.costUsdNano,
      },
    });
    return output;
  } catch (error) {
    // In particular, SETTLEMENT_EXCEEDS_RESERVED retains the funds and never
    // returns the result. An operator must reconcile the actual provider bill.
    await journalHeld("AI_METERING_SETTLEMENT_PENDING");
    throw new MeteredAiJsonError("AI_METERING_SETTLEMENT_PENDING", { cause: error });
  }
}
