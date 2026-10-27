import type { PrismaClient } from "@zoeskoul/db";
import { prisma } from "@zoeskoul/platform-server/prisma";
import {
  assertAiJsonInputEnvelope,
  type AiJsonRequest,
  type AiJsonTransport,
} from "@zoeskoul/ai-json";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import { executeMeteredAiJsonRequest, MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES } from "./meteredAiJsonExecution";
import type { ZoeBuildMeteredPlanningContext } from "./meteredZoeBuildPlanning";
import { assertZoeProductionBillingReady } from "./zoeProductionBillingGate";
import { resolveProductionZoeBuildBillingProfile } from "./reviewedAiBillingRegistry";
import { deriveZoeBuildAttemptReservation } from "./verifiedAiCreditReservationPolicy";
import { createPrismaAiCreditResultJournal } from "./aiCreditResultJournal";

/**
 * V12J.9C: compose the EXISTING ledger-backed executor for the three ZoeBuild
 * AI routes. This does not approve ANY provider rates, models, wallets,
 * conversion or deployment environment. The reviewed production registry and
 * operational readiness attestation remain mandatory and currently empty.
 *
 * Never supply billing policy from browser input, LLM output or env JSON.
 */
export class ZoeBuildRequiredMeteringError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildRequiredMeteringError";
  }
}

function identity(userId: string, operationId: string) {
  if (!userId.trim() || userId.length > 100 ||
      !operationId.trim() || operationId.length > 100) {
    throw new ZoeBuildRequiredMeteringError("AI_METERING_ROUTE_IDENTITY_INVALID");
  }
}

function candidateFor(transport: AiJsonTransport): BuildModelCandidate {
  const provider = transport.providerId;
  if (provider !== "openai" && provider !== "gemini" &&
      provider !== "claude" && provider !== "deepseek") {
    throw new ZoeBuildRequiredMeteringError("AI_METERING_ROUTE_PROVIDER_UNSUPPORTED");
  }
  if (!transport.model.trim() || transport.model.length > 160) {
    throw new ZoeBuildRequiredMeteringError("AI_METERING_ROUTE_MODEL_INVALID");
  }
  return {
    provider, model: transport.model, tier: "economy",
    reason: "Selected by trusted ZoeBuild assistant route",
  };
}

/**
 * Planner still builds the FULL system prompt and JSON schema before policy
 * review. Fallback attempts receive distinct idempotency keys in its existing
 * metered planner. No provider call or reservation occurs without approval.
 */
export function createRequiredZoeBuildPlanningMetering(input: Readonly<{
  userId: string;
  operationId: string;
  client?: PrismaClient;
}>): ZoeBuildMeteredPlanningContext {
  identity(input.userId, input.operationId);
  return {
    client: input.client ?? prisma,
    userId: input.userId,
    operationId: input.operationId,
    async resolveAttemptPolicy(candidate, _attemptIndex, _request) {
      // Includes compiled pricing/operations sign-off AND active encrypted writer.
      // Keep generation on the same gate as paid answer/edit/intent operations.
      const at = new Date();
      assertZoeProductionBillingReady(candidate, at);
      // Resolve again for the attempt's policy object. Approval cannot be
      // supplied by the planner or the user.
      return resolveProductionZoeBuildBillingProfile(candidate, at);
    },
  };
}

/**
 * Wrap an already server-selected intent/edit transport. The transport cannot
 * be called until a source-reviewed standard-rate model and all operational
 * approvals exist. `executeMeteredAiJsonRequest` alone owns reservation,
 * request binding, usage capture, receipt persistence and exact settlement.
 *
 * Streaming reasoning summaries are intentionally omitted in required mode:
 * the metered executor snapshots only price-reviewed JSON request fields.
 * SSE still emits status and a completed proposal; never claim unbilled deltas.
 */
export function createRequiredZoeBuildAssistantTransport(input: Readonly<{
  transport: AiJsonTransport;
  client?: PrismaClient;
  userId: string;
  operationId: string;
  purpose: "intent" | "edit" | "answer";
  /** Stable ordinal of a tool-driven model request within one logical edit. */
  stepIndex?: number;
}>): AiJsonTransport {
  identity(input.userId, input.operationId);
  const candidate = candidateFor(input.transport);
  if (input.stepIndex !== undefined &&
      (!Number.isSafeInteger(input.stepIndex) || input.stepIndex < 0 || input.stepIndex >= 12 ||
       input.purpose !== "edit")) {
    throw new ZoeBuildRequiredMeteringError("AI_METERING_ROUTE_STEP_INVALID");
  }
  // The original single-call identity is preserved for intent, answer and
  // page creation. Each agent step has its own durable retry-stable ledger key.
  const idempotencyKey = `${input.operationId}:${input.purpose}` +
    (input.stepIndex === undefined ? "" : `:step:${input.stepIndex}`);
  return {
    providerId: input.transport.providerId,
    model: input.transport.model,
    capabilities: input.transport.capabilities,
    async generateJsonText(request: AiJsonRequest) {
      if (request.media?.length) {
        throw new ZoeBuildRequiredMeteringError("AI_METERING_ROUTE_MEDIA_UNPRICED");
      }
      // Validate full input before looking up any model policy, wallet or provider.
      assertAiJsonInputEnvelope(request, MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES);
      const occurredAt = new Date();
      // This is intentionally ALWAYS the production-review resolver: no
      // NODE_ENV/testing shortcut, synthetic policy, or caller override.
      assertZoeProductionBillingReady(candidate, occurredAt);
      const reviewed = resolveProductionZoeBuildBillingProfile(candidate, occurredAt);
      const ceiling = deriveZoeBuildAttemptReservation({
        candidate, policy: reviewed, occurredAt,
      });
      // No reasoning-stream callbacks are charged or passed through. Preserve
      // the exact system/user/schema and let the executor enforce output caps.
      return executeMeteredAiJsonRequest({
        transport: input.transport,
        request: {
          system: request.system,
          user: request.user,
          schemaName: request.schemaName,
          ...(request.responseJsonSchema === undefined ? {} : {
            responseJsonSchema: request.responseJsonSchema,
          }),
          maxOutputTokens: ceiling.maxOutputTokens,
        },
        client: input.client ?? prisma,
        userId: input.userId,
        idempotencyKey,
        pricingCatalog: ceiling.pricingCatalog,
        pricingVersionId: ceiling.pricingVersionId,
        conversion: ceiling.conversion,
        maximumUnits: ceiling.maximumUnits,
        maxCombinedInputTokens: reviewed.maxCombinedInputTokens,
        maxBillableOutputTokens: reviewed.maxBillableOutputTokens,
        occurredAt,
        resultJournal: createPrismaAiCreditResultJournal({
          client: input.client ?? prisma,
          encryptionKey: process.env.ZOEBUILD_AI_RESULT_KEY_V1,
              encryptionKeyV2: process.env.ZOEBUILD_AI_RESULT_KEY_V2,
              encryptionKeyV3: process.env.ZOEBUILD_AI_RESULT_KEY_V3,
              activeKeyId: process.env.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID as "v1" | "v2" | "v3" | undefined,
        }),
      });
    },
  };
}
