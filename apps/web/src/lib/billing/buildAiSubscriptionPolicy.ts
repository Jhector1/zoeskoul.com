import { FeatureKey } from "@zoeskoul/db";

/** Authoritative billing inputs, never client-provided or inferred by Zoé. */
export type BuilderAiSubscriptionEligibility = Readonly<{
  subscriptionActive: boolean;
  productIncludesBuilderAi: boolean;
}>;

/** Single Builder AI bundle; distinct technical permissions remain revocable. */
export const BUILDER_AI_FEATURE_KEYS = [
  FeatureKey.build_ai_generate,
  FeatureKey.build_ai_edit,
] as const;

export function builderAiSubscriptionFeatures(
  eligibility: BuilderAiSubscriptionEligibility,
): readonly FeatureKey[] {
  return eligibility.subscriptionActive && eligibility.productIncludesBuilderAi
    ? BUILDER_AI_FEATURE_KEYS
    : [];
}
