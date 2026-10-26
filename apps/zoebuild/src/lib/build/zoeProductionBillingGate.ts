import { aiCreditResultKeyring, AiCreditResultError } from "./aiCreditResultCrypto";
import { resolveProductionZoeBuildBillingProfile } from "./reviewedAiBillingRegistry";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";

/**
 * V12J.19 — one identical, fail-closed runtime gate for paid planning,
 * classification, professional answers and targeted edits. This is a
 * prerequisite check, NOT an approval authority: only the compiled model,
 * published price and operations registries may authorize spend.
 *
 * No NODE_ENV branch, test-only billing policy, browser-supplied prices,
 * database mutation, provider request, or legacy-key substitution.
 */
export class ZoeProductionBillingGateError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ZoeProductionBillingGateError"; }
}

export type ZoeProductionKeyConfiguration = Readonly<{
  v1?: string;
  v2?: string;
  v3?: string;
  activeKeyId?: string;
}>;

/** Pure key readiness check; validated by the same AES-GCM key parser as execution. */
export function assertZoeProductionResultWriter(config: ZoeProductionKeyConfiguration): "v1" | "v2" | "v3" {
  try {
    return aiCreditResultKeyring(config).activeKeyId;
  } catch (error) {
    if (error instanceof AiCreditResultError) {
      // Only static error codes; never report secret material.
      throw new ZoeProductionBillingGateError(error.code);
    }
    throw new ZoeProductionBillingGateError("AI_RESULT_CONFIGURATION_INVALID");
  }
}

/** Inspect real process secrets. Never print or return secret values. */
export function inspectZoeProductionSecrets(input: Readonly<{
  providerId: string;
  providerKey: string | undefined;
  keys: ZoeProductionKeyConfiguration;
}>): Readonly<{writerKeyId: "v1" | "v2" | "v3"}> {
  if (input.providerId !== "openai")
    throw new ZoeProductionBillingGateError("AI_BILLING_PROVIDER_NOT_REVIEWED");
  if (!input.providerKey?.trim())
    throw new ZoeProductionBillingGateError("AI_BILLING_PROVIDER_KEY_MISSING");
  return {writerKeyId: assertZoeProductionResultWriter(input.keys)};
}

/** Runtime wiring: candidate is server-selected and price-approved, never browser-authorized. */
export function assertZoeProductionBillingReady(candidate: BuildModelCandidate, occurredAt = new Date()): void {
  // Model, published price, credit conversion, and independent operational
  // sign-off must ALL pass. Empty compiled registries intentionally block.
  resolveProductionZoeBuildBillingProfile(candidate, occurredAt);
  inspectZoeProductionSecrets({
    providerId: candidate.provider,
    providerKey: process.env.OPENAI_API_KEY,
    keys: {
      v1: process.env.ZOEBUILD_AI_RESULT_KEY_V1,
      v2: process.env.ZOEBUILD_AI_RESULT_KEY_V2,
      v3: process.env.ZOEBUILD_AI_RESULT_KEY_V3,
      activeKeyId: process.env.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID,
    },
  });
}
