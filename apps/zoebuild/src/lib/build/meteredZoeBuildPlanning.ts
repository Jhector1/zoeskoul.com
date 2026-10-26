import type { PrismaClient } from "@zoeskoul/db";
import type { BuildAiPlanner } from "@zoeskoul/build-ai";
import { createBuildAiPlannerFromJsonTransport } from "@zoeskoul/build-ai";
import {
  assertAiJsonInputEnvelope,
  type AiJsonRequest,
  type AiJsonTransport,
} from "@zoeskoul/ai-json";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import { createZoeBuildAiJsonTransport } from "./createZoeBuildAiPlanner";
import {
  executeMeteredAiJsonRequest,
  MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES,
} from "./meteredAiJsonExecution";
import { createPrismaAiCreditResultJournal } from "./aiCreditResultJournal";
import {
  deriveZoeBuildAttemptReservation,
  type ZoeBuildVerifiedAttemptPolicy,
} from "./verifiedAiCreditReservationPolicy";

/** Only a reviewed SERVER-owned model contract may supply a spend policy. */
export type ZoeBuildAttemptSpendPolicy = ZoeBuildVerifiedAttemptPolicy;

export type ZoeBuildMeteredPlanningContext = Readonly<{
  client: PrismaClient;
  userId: string;
  operationId: string;
  /**
   * Inspect the COMPLETE generated system/user/schema envelope before any paid
   * transport is constructed, and return a server-reviewed model cost profile.
   * This snapshot is NOT a verified billable-token count or a credit guarantee.
   */
  resolveAttemptPolicy: (
    candidate: BuildModelCandidate,
    attemptIndex: number,
    request: AiJsonRequest,
  ) => Promise<ZoeBuildAttemptSpendPolicy>;
}>;

// Same enforced envelope as the credit executor; one canonical threshold.
function snapshotJsonRequest(request: AiJsonRequest): AiJsonRequest {
  // Never forward arbitrary caller fields or media. A prior envelope check
  // rejects malformed/cyclic/accessor-bearing schemas synchronously.
  return {
    system: request.system,
    user: request.user,
    schemaName: request.schemaName,
    ...(request.responseJsonSchema === undefined ? {} : {
      responseJsonSchema: JSON.parse(JSON.stringify(request.responseJsonSchema)) as NonNullable<AiJsonRequest["responseJsonSchema"]>,
    }),
  };
}

/**
 * The deterministic BuildAiPlanner constructs the FULL system prompt and JSON
 * schema first. Resolve server billing policy against that exact text/schema;
 * then derive the reservation and construct the paid provider transport.
 * Each routing fallback gets an independent idempotency key.
 *
 * This refactor makes complete-input review possible. It does NOT prove an
 * upper bound on provider-billed tokens or enable production charging.
 */
export function createMeteredZoeBuildAttemptPlanner(input: Readonly<{
  candidate: BuildModelCandidate;
  attemptIndex: number;
  metering: ZoeBuildMeteredPlanningContext;
}>): BuildAiPlanner {
  const { candidate, attemptIndex, metering } = input;
  if (!Number.isSafeInteger(attemptIndex) || attemptIndex < 0) {
    throw new Error("BUILD_AI_METERING_ATTEMPT_INVALID");
  }
  if (!metering.userId.trim() || !metering.operationId.trim() ||
      metering.operationId.length > 100) {
    throw new Error("BUILD_AI_METERING_IDENTITY_INVALID");
  }
  const idempotencyKey = `${metering.operationId}:attempt:${attemptIndex}`;

  return {
    async generateProjectSpecification(request) {
      if (request.media?.length) {
        throw new Error("BUILD_AI_METERING_MULTIMODAL_UNPRICED");
      }
      // This metadata-only facade cannot dispatch to a provider. The real
      // transport is created exclusively AFTER verified policy resolution.
      const facade: AiJsonTransport = {
        providerId: candidate.provider,
        model: candidate.model,
        capabilities: { text: true, image: false, audio: false, video: false },
        async generateJsonText(jsonRequest) {
          if (jsonRequest.media?.length) {
            throw new Error("BUILD_AI_METERING_MULTIMODAL_UNPRICED");
          }
          // Count all supplied text+schema, not only the end-user prompt.
          // This byte guard is deliberately NOT a billable-token limit.
          assertAiJsonInputEnvelope(jsonRequest, MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES);
          const dispatchRequest = snapshotJsonRequest(jsonRequest);
          // Give policy callback its OWN copy. It cannot alter the payload
          // sent to the metered executor while asynchronously reviewing it.
          const policyRequest = snapshotJsonRequest(dispatchRequest);
          const occurredAt = new Date();
          const verified = await metering.resolveAttemptPolicy(
            candidate, attemptIndex, policyRequest,
          );
          const policy = deriveZoeBuildAttemptReservation({
            candidate, policy: verified, occurredAt,
          });
          const transport = createZoeBuildAiJsonTransport({
            provider: candidate.provider, model: candidate.model,
          });
          if (transport.providerId !== candidate.provider ||
              transport.model !== candidate.model) {
            throw new Error("BUILD_AI_METERING_TRANSPORT_MISMATCH");
          }
          return executeMeteredAiJsonRequest({
            transport,
            request: { ...dispatchRequest, maxOutputTokens: policy.maxOutputTokens },
            client: metering.client,
            userId: metering.userId,
            idempotencyKey,
            pricingCatalog: policy.pricingCatalog,
            pricingVersionId: policy.pricingVersionId,
            conversion: policy.conversion,
            maximumUnits: policy.maximumUnits,
            maxCombinedInputTokens: verified.maxCombinedInputTokens,
            maxBillableOutputTokens: verified.maxBillableOutputTokens,
            occurredAt,
            resultJournal: createPrismaAiCreditResultJournal({
              client: metering.client,
              encryptionKey: process.env.ZOEBUILD_AI_RESULT_KEY_V1,
              encryptionKeyV2: process.env.ZOEBUILD_AI_RESULT_KEY_V2,
              encryptionKeyV3: process.env.ZOEBUILD_AI_RESULT_KEY_V3,
              activeKeyId: process.env.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID as "v1" | "v2" | "v3" | undefined,
            }),
          });
        },
      };
      return createBuildAiPlannerFromJsonTransport(facade)
        .generateProjectSpecification(request);
    },
  };
}
