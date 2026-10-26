import { describe, expect, it } from "vitest";
import type { AiJsonUsage } from "./usage";
import { assertOpenAi30mCacheBilling } from "./openAi30mCacheBilling";

function response(write: number | null, lifetime?: unknown): AiJsonUsage {
  return {
    provider: "openai", inputTokens: 1200, outputTokens: 200,
    cachedInputTokens: 200, cacheWriteInputTokens: write,
    reasoningOutputTokens: 20,
    providerRaw: {input_tokens_details: {
      cached_tokens: 200, cache_write_tokens: write,
      ...(lifetime === undefined ? {} : {cache_write_tokens_details: lifetime}),
    }},
  };
}

describe("V12J.16E provider-reported cache write lifetime", () => {
  it("accepts a provider-confirmed all-30-minute cache write", () => {
    expect(() => assertOpenAi30mCacheBilling(response(300,
      {ttl_30m_tokens:300,ttl_12h_tokens:0}))).not.toThrow();
  });
  it("accepts no writes without needing to invent lifetime counters", () => {
    expect(() => assertOpenAi30mCacheBilling(response(0))).not.toThrow();
    expect(() => assertOpenAi30mCacheBilling(response(0,
      {ttl_30m_tokens:0,ttl_12h_tokens:0}))).not.toThrow();
  });
  it("rejects even one 12h write despite a 30m request policy", () => {
    expect(() => assertOpenAi30mCacheBilling(response(300,
      {ttl_30m_tokens:299,ttl_12h_tokens:1}))).toThrow("AI_CACHE_WRITE_12H_UNPRICED");
  });
  it("refuses positive writes with no provider lifetime breakdown", () => {
    expect(() => assertOpenAi30mCacheBilling(response(300)))
      .toThrow("AI_CACHE_WRITE_LIFETIME_UNVERIFIED");
  });
  it("refuses inconsistent or absent lifetime category counts", () => {
    for (const lifetime of [
      {ttl_30m_tokens:250,ttl_12h_tokens:0},
      {ttl_30m_tokens:300},
      {ttl_30m_tokens:-1,ttl_12h_tokens:0},
      {ttl_30m_tokens:300,ttl_12h_tokens:0,ttl_24h_tokens:0},
    ]) expect(() => assertOpenAi30mCacheBilling(response(300,lifetime))).toThrow();
    expect(() => assertOpenAi30mCacheBilling(response(null)))
      .toThrow("AI_CACHE_WRITE_COUNTER_UNVERIFIED");
  });
  it("rejects mismatched 12h counts even when aggregate write count says zero", () => {
    expect(() => assertOpenAi30mCacheBilling(response(0,
      {ttl_30m_tokens:0,ttl_12h_tokens:1}))).toThrow("AI_CACHE_WRITE_BREAKDOWN_MISMATCH");
  });
});
