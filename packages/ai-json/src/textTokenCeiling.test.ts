import { describe, expect, it } from "vitest";
import { calculateAiTextTokenCeiling } from "./textTokenCeiling";
import type { AiPricingVersion } from "./pricing";

const price: AiPricingVersion = {
  id: "unit-openai-rate-1", provider: "openai", model: "model-a",
  effectiveFrom: "2026-10-01T00:00:00Z", currency: "USD",
  rates: [
    { category: "input", usdPerMillionTokens: "2.00" },
    { category: "cached_input", usdPerMillionTokens: "0.50" },
    { category: "cache_write", usdPerMillionTokens: "0.00" },
    { category: "output", usdPerMillionTokens: "8.00" },
  ],
};
const params = {
  provider: "openai" as const, model: "model-a",
  occurredAt: "2026-10-19T10:00:00Z", catalog: [price],
  maxCombinedInputTokens: 1_000, maxBillableOutputTokens: 100,
};

describe("E16C4D1 conservative preflight token-cost arithmetic", () => {
  it("returns nanodollar maximum with one final round-up", () => {
    expect(calculateAiTextTokenCeiling(params)).toMatchObject({
      costUsdNano: "2800000", pricingVersionId: price.id,
    });
  });
  it("rounds sub-nanodollar fractions UP exactly once", () => {
    const result = calculateAiTextTokenCeiling({ ...params,
      maxCombinedInputTokens: 1, maxBillableOutputTokens: 1,
      catalog: [{ ...price, rates: price.rates.map(r => ({ ...r,
        usdPerMillionTokens: r.category === "input" || r.category === "output" ? "0.000000001" : "0.00",
      })) }],
    });
    expect(result.costUsdNano).toBe("1");
  });
  it("chooses the costliest input billing category, even cached input", () => {
    const costlyCached = { ...price, rates: price.rates.map(r => r.category === "cached_input"
      ? { ...r, usdPerMillionTokens: "9.00" } : r) };
    expect(calculateAiTextTokenCeiling({ ...params, catalog: [costlyCached] }).costUsdNano)
      .toBe("9800000");
  });
  it("reserves enough for OpenAI cache writes even when their rate exceeds normal input", () => {
    const withWritePremium = { ...price, rates: price.rates.map(r =>
      r.category === "cache_write" ? {...r, usdPerMillionTokens:"2.50"} : r) };
    // One thousand cache-write tokens at $2.50/1M, plus 100 output at $8/1M.
    expect(calculateAiTextTokenCeiling({ ...params, catalog: [withWritePremium] }).costUsdNano)
      .toBe("3300000");
  });
  it("accounts conservatively for Claude cache creation/read costs", () => {
    const claude = { ...price, id: "claude-test", provider: "claude" as const,
      rates: price.rates.map(r => r.category === "cache_write"
        ? { ...r, usdPerMillionTokens: "12.00" } : r) };
    const result = calculateAiTextTokenCeiling({ ...params, provider: "claude", catalog: [claude] });
    expect(result.costUsdNano).toBe("12800000");
  });
  it("fails closed without a unique effective price version", () => {
    expect(() => calculateAiTextTokenCeiling({ ...params, catalog: [] }))
      .toThrow("PRICE_VERSION_NOT_UNIQUE");
    expect(() => calculateAiTextTokenCeiling({ ...params, catalog: [price, price] }))
      .toThrow("PRICE_VERSION_NOT_UNIQUE");
  });
  it("rejects invalid bounds and zero-price charging policies", () => {
    for (const count of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => calculateAiTextTokenCeiling({ ...params, maxCombinedInputTokens: count }))
        .toThrow("INVALID_INPUT_CEILING");
      expect(() => calculateAiTextTokenCeiling({ ...params, maxBillableOutputTokens: count }))
        .toThrow("INVALID_OUTPUT_CEILING");
    }
    const free = { ...price, rates: price.rates.map(r => ({ ...r, usdPerMillionTokens: "0" })) };
    expect(() => calculateAiTextTokenCeiling({ ...params, catalog: [free] }))
      .toThrow("ZERO_COST_RESERVATION_UNSUPPORTED");
  });
  it("refuses Gemini until thinking/cache model billing is verified", () => {
    expect(() => calculateAiTextTokenCeiling({ ...params, provider: "gemini" }))
      .toThrow("GEMINI_MODEL_BILLING_POLICY_REQUIRED");
  });
  it("fails closed when a required price category is missing or malformed", () => {
    const incomplete = { ...price, rates: price.rates.filter(r => r.category !== "cache_write") };
    expect(() => calculateAiTextTokenCeiling({ ...params, catalog: [incomplete] }))
      .toThrow("MISSING_RATE");
  });
});
