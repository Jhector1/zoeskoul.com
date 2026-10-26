import { describe, expect, it } from "vitest";
import { priceAiJsonUsage, AiPricingError, type AiPricingVersion } from "./pricing";
import type { AiJsonUsage } from "./usage";

const base: AiJsonUsage = {
  provider: "openai", inputTokens: 1_000_000, outputTokens: 100_000,
  cachedInputTokens: 200_000, cacheWriteInputTokens: 0,
  reasoningOutputTokens: null, providerRaw: {}
};
const version: AiPricingVersion = {
  id: "openai-test-2026-10", provider: "openai", model: "test-model",
  effectiveFrom: "2026-10-01T00:00:00Z", currency: "USD",
  rates: [
    { category: "input", usdPerMillionTokens: "2.00" },
    { category: "output", usdPerMillionTokens: "8.00" },
    { category: "cached_input", usdPerMillionTokens: "0.50" },
    { category: "cache_write", usdPerMillionTokens: "0.00" },
  ]
};
const args = { usage: base, provider: "openai" as const, model: "test-model",
  occurredAt: "2026-10-19T00:00:00Z", catalog: [version] };
describe("deterministic provider pricing", () => {
  it("prices ordinary, cached and output tokens exactly in nanodollars", () => {
    const result = priceAiJsonUsage(args);
    expect(result.costUsdNano).toBe("2500000000"); // 1.6 + .1 + .8 USD
    expect(result.billableTokens.input).toBe(800_000);
  });
  it("charges OpenAI cache writes at their own rate, without double-counting input", () => {
    const withWrites = { ...base, cacheWriteInputTokens: 300_000 };
    const withWriteRate = { ...version, rates: version.rates.map(r =>
      r.category === "cache_write" ? { ...r, usdPerMillionTokens: "2.50" } : r) };
    const result = priceAiJsonUsage({ ...args, usage: withWrites, catalog: [withWriteRate] });
    // 500k ordinary * $2 + 200k cached * $0.50 + 300k writes * $2.50
    // + 100k output * $8 = $2.65 total.
    expect(result.billableTokens).toEqual({
      input: 500_000, cached_input: 200_000, cache_write: 300_000, output: 100_000,
    });
    expect(result.costUsdNano).toBe("2650000000");
  });
  it("fails closed when OpenAI read/write counters are missing or overlap", () => {
    for (const usage of [
      {...base, cachedInputTokens: null},
      {...base, cacheWriteInputTokens: null},
    ]) {
      expect(() => priceAiJsonUsage({ ...args, usage }))
        .toThrow("OPENAI_CACHE_USAGE_UNVERIFIED");
    }
    for (const usage of [
      {...base, cachedInputTokens: 800_001, cacheWriteInputTokens: 200_000},
      {...base, cachedInputTokens: 200_000, cacheWriteInputTokens: 800_001},
    ]) {
      expect(() => priceAiJsonUsage({...args, usage})).toThrow("CACHE_EXCEEDS_INPUT");
    }
  });
  it("fails closed for missing usage, models and prices", () => {
    expect(() => priceAiJsonUsage({ ...args, usage: null })).toThrow(AiPricingError);
    expect(() => priceAiJsonUsage({ ...args, model: "unknown" })).toThrow("PRICE_VERSION_NOT_UNIQUE");
    expect(() => priceAiJsonUsage({ ...args, catalog: [] })).toThrow("PRICE_VERSION_NOT_UNIQUE");
  });
  it("rejects overlapping versions and invalid rates", () => {
    expect(() => priceAiJsonUsage({ ...args, catalog: [version, version] })).toThrow("PRICE_VERSION_NOT_UNIQUE");
    expect(() => priceAiJsonUsage({ ...args, catalog: [{ ...version, rates: [{ category: "input", usdPerMillionTokens: "NaN" }] }] })).toThrow("INVALID_RATE");
  });
  it("separates Claude cache-write and cache-read from ordinary input", () => {
    const claude = { ...base, provider: "claude" as const, inputTokens: 10,
      cachedInputTokens: 20, cacheWriteInputTokens: 30 };
    const priced = priceAiJsonUsage({ ...args, provider: "claude", usage: claude,
      catalog: [{ ...version, provider: "claude" }] });
    expect(priced.billableTokens).toEqual({ input: 10, output: 100000, cached_input: 20, cache_write: 30 });
  });
  it("fails closed on Gemini cached usage until model billing semantics are verified", () => {
    expect(() => priceAiJsonUsage({ ...args, provider: "gemini",
      usage: { ...base, provider: "gemini" }, catalog: [{ ...version, provider: "gemini" }] }))
      .toThrow("GEMINI_CACHE_BILLING_REQUIRES_MODEL_POLICY");
  });
});
