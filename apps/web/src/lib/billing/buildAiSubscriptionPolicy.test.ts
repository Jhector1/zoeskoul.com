import { describe, expect, it } from "vitest";
import { FeatureKey } from "@zoeskoul/db";
import { builderAiSubscriptionFeatures } from "./buildAiSubscriptionPolicy";

describe("verified Builder AI subscription policy", () => {
  it("requires both an active subscription AND product-level inclusion", () => {
    expect(builderAiSubscriptionFeatures({subscriptionActive: false, productIncludesBuilderAi: true})).toEqual([]);
    expect(builderAiSubscriptionFeatures({subscriptionActive: true, productIncludesBuilderAi: false})).toEqual([]);
  });
  it("grants generation and editing as separate keys for an eligible product", () => {
    expect(builderAiSubscriptionFeatures({subscriptionActive: true, productIncludesBuilderAi: true})).toEqual([
      FeatureKey.build_ai_generate,
      FeatureKey.build_ai_edit,
    ]);
  });
});
