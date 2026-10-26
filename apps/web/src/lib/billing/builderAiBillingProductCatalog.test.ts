import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { configuredBuilderAiPriceIds } from "@zoeskoul/platform-server/billing/productCatalog";

describe("server-owned Builder AI Stripe price catalog", () => {
  it("defaults to no eligible products rather than including learning subscriptions", () => {
    expect([...configuredBuilderAiPriceIds("")]).toEqual([]);
    expect([...configuredBuilderAiPriceIds("  ")]).toEqual([]);
  });
  it("recognizes only explicitly registered prices", () => {
    expect([...configuredBuilderAiPriceIds("price_builderMonthly, price_builderAnnual")]).toEqual([
      "price_builderMonthly", "price_builderAnnual",
    ]);
  });
  it("fails on invalid or duplicate configuration", () => {
    expect(() => configuredBuilderAiPriceIds("price_good,not_a_price")).toThrow();
    expect(() => configuredBuilderAiPriceIds("price_good,price_good")).toThrow();
    expect(() => configuredBuilderAiPriceIds("price_good,")).toThrow();
  });
});
