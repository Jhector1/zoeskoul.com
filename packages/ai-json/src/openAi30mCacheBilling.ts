import type { AiJsonUsage } from "./usage";

/**
 * A metered Standard-rate policy has ONE cache-write price: 30 minutes.
 * Provider-reported TTL breakdowns are independent of the requested cache TTL.
 * Never infer that every write was 30m just because the request was pinned.
 *
 * This function is intentionally called only for actual provider responses,
 * not the synthetic all-cache-write scenario used to size reservations.
 */
export class OpenAi30mCacheBillingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OpenAi30mCacheBillingError";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function counter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Assert that no unpriced 12h cache writes can reach the 30m settlement rate.
 * Unknown breakdowns for positive writes remain held for reconciliation.
 */
export function assertOpenAi30mCacheBilling(usage: AiJsonUsage): void {
  if (usage.provider !== "openai" || !counter(usage.cacheWriteInputTokens)) {
    throw new OpenAi30mCacheBillingError("AI_CACHE_WRITE_COUNTER_UNVERIFIED");
  }
  const inputDetails = object(usage.providerRaw.input_tokens_details);
  const lifetimeDetails = object(inputDetails?.cache_write_tokens_details);
  if (!lifetimeDetails) {
    if (usage.cacheWriteInputTokens !== 0) {
      throw new OpenAi30mCacheBillingError("AI_CACHE_WRITE_LIFETIME_UNVERIFIED");
    }
    return;
  }
  // Fail closed on unknown categories, including new TTL buckets that might
  // have a higher charge than the approved 30m rate.
  const keys = Object.keys(lifetimeDetails);
  if (keys.some(key => key !== "ttl_30m_tokens" && key !== "ttl_12h_tokens") ||
      !counter(lifetimeDetails.ttl_30m_tokens) ||
      !counter(lifetimeDetails.ttl_12h_tokens)) {
    throw new OpenAi30mCacheBillingError("AI_CACHE_WRITE_BREAKDOWN_UNVERIFIED");
  }
  const total = lifetimeDetails.ttl_30m_tokens + lifetimeDetails.ttl_12h_tokens;
  if (!Number.isSafeInteger(total) || total !== usage.cacheWriteInputTokens) {
    throw new OpenAi30mCacheBillingError("AI_CACHE_WRITE_BREAKDOWN_MISMATCH");
  }
  if (lifetimeDetails.ttl_12h_tokens > 0) {
    throw new OpenAi30mCacheBillingError("AI_CACHE_WRITE_12H_UNPRICED");
  }
}
