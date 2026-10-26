import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import { resolveProductionZoeBuildBillingProfile } from "./reviewedAiBillingRegistry";

/**
 * V12J.16B — paid TARGETED EDIT model selection only.
 * The caller must separately authenticate, verify ownership, entitlement,
 * operation ID and the actual wallet reservation. This selector does none
 * of those things. It deliberately consults the EXACT production approvals;
 * no env-supplied pricing, alternate test registry or development bypass.
 *
 * Until BOTH compiled registries have independently signed-off entries,
 * this function refuses every metered edit BEFORE constructing a transport.
 */
export class ZoeBuildPaidEditSelectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildPaidEditSelectionError";
  }
}

const FIRST_EDIT_MODEL: BuildModelCandidate = Object.freeze({
  provider: "openai",
  model: "gpt-6-luna",
  tier: "economy",
  reason: "Bounded first text-only edit; production billing approval mandatory",
});

export function resolveFirstReviewedPaidEditModel(occurredAt = new Date()): Readonly<{
  provider: "openai";
  model: "gpt-6-luna";
}> {
  // This performs D2 + independently published D6 + operational D9 checks.
  // Lack of ANY approval fails closed. Do not catch or downgrade the error.
  const policy = resolveProductionZoeBuildBillingProfile(FIRST_EDIT_MODEL, occurredAt);
  if (policy.maxCombinedInputTokens < 1 || policy.maxCombinedInputTokens > 20_000 ||
      policy.maxOutputTokens < 1 || policy.maxOutputTokens > 4_096 ||
      policy.maxBillableOutputTokens !== policy.maxOutputTokens ||
      policy.evidence.provider !== "openai" || policy.evidence.model !== "gpt-6-luna") {
    throw new ZoeBuildPaidEditSelectionError("AI_PAID_EDIT_POLICY_OUT_OF_SCOPE");
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new ZoeBuildPaidEditSelectionError("AI_PAID_EDIT_PROVIDER_NOT_CONFIGURED");
  }
  // Re-evaluation in createRequiredZoeBuildAssistantTransport remains mandatory
  // just before credit reservation, to prevent stale/changed approvals.
  return { provider: "openai", model: "gpt-6-luna" };
}
