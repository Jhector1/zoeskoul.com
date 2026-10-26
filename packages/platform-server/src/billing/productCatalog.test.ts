import { describe, expect, it } from "vitest";
import {
  configuredBuilderAiPriceIds, resolvePlatformBillingCatalog,
  resolvePlatformProductForPrice, requirePlatformPriceForProduct,
} from "./productCatalog";

const env = {
  STRIPE_PRICE_MONTHLY_ID: "price_learning_month",
  STRIPE_PRICE_YEARLY_ID: "price_learning_year",
  ZOEBUILD_AI_STRIPE_PRICE_IDS: "price_builder_month,price_builder_year",
};

describe("canonical platform billing catalog", () => {
  it("separates learning and builder prices", () => {
    const catalog = resolvePlatformBillingCatalog(env);
    expect(catalog).toHaveLength(4);
    expect(resolvePlatformProductForPrice(catalog, "price_builder_month")?.product).toBe("builder_ai");
    expect(requirePlatformPriceForProduct({ catalog, product: "learning", priceId: "price_learning_month" }).tier).toBe("monthly");
    expect(() => requirePlatformPriceForProduct({ catalog, product: "builder_ai", priceId: "price_learning_month" })).toThrow("BILLING_PRODUCT_PRICE_NOT_ALLOWED");
  });
  it("rejects cross-product price reuse and duplicates", () => {
    expect(() => resolvePlatformBillingCatalog({ ...env, ZOEBUILD_AI_STRIPE_PRICE_IDS: "price_learning_month" })).toThrow();
    expect(() => resolvePlatformBillingCatalog({ ...env, STRIPE_PRICE_YEARLY_ID: "price_learning_month" })).toThrow();
    expect(() => configuredBuilderAiPriceIds("price_x,price_x")).toThrow();
    expect(() => configuredBuilderAiPriceIds("bad_value")).toThrow();
  });
  it("does not infer builder subscription access when no price configured", () => {
    expect(resolvePlatformBillingCatalog({STRIPE_PRICE_MONTHLY_ID:"price_learning_month"})
      .filter(item => item.product === "builder_ai")).toHaveLength(0);
  });
});
