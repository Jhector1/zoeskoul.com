import type { AiJsonUsage } from "./usage";

export type AiPriceCategory = "input" | "output" | "cached_input" | "cache_write";
export type AiPricingRate = Readonly<{ category: AiPriceCategory; usdPerMillionTokens: string }>;
export type AiPricingVersion = Readonly<{
  id: string;
  provider: AiJsonUsage["provider"];
  model: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  currency: "USD";
  rates: readonly AiPricingRate[];
}>;
export type AiPricedUsage = Readonly<{
  pricingVersionId: string;
  provider: AiJsonUsage["provider"];
  model: string;
  billableTokens: Readonly<Record<AiPriceCategory, number>>;
  costUsdNano: string;
}>;

export class AiPricingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiPricingError";
  }
}

const SCALE = 1_000_000_000n; // nanodollars
const MILLION = 1_000_000n;
function parseUsdPerMillion(value: string): bigint {
  if (!/^(0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value)) throw new AiPricingError("INVALID_RATE");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(9, "0"));
}
function count(value: number | null): bigint {
  if (!Number.isSafeInteger(value) || value === null || value < 0)
    throw new AiPricingError("INVALID_USAGE");
  return BigInt(value);
}
function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !/^\d{4}-\d\d-\d\dT/.test(value))
    throw new AiPricingError("INVALID_EFFECTIVE_DATE");
  return parsed;
}

/**
 * Exact provider-usage pricing. Rates are authoritative, externally verified
 * snapshots supplied by billing; this module never guesses current API rates.
 * The result is an integer number of USD nanodollars, rounded UP once.
 */
export function priceAiJsonUsage(input: Readonly<{
  usage: AiJsonUsage | null;
  provider: AiJsonUsage["provider"];
  model: string;
  occurredAt: string;
  catalog: readonly AiPricingVersion[];
}>): AiPricedUsage {
  const { usage, provider, model, catalog } = input;
  if (!usage || usage.provider !== provider) throw new AiPricingError("MISSING_USAGE");
  if (!model.trim()) throw new AiPricingError("INVALID_MODEL");
  const at = timestamp(input.occurredAt);
  const versions = catalog.filter(v => v.provider === provider && v.model === model &&
    timestamp(v.effectiveFrom) <= at && (v.effectiveUntil === undefined || at < timestamp(v.effectiveUntil)));
  if (versions.length !== 1) throw new AiPricingError("PRICE_VERSION_NOT_UNIQUE");
  const version = versions[0];
  if (version.currency !== "USD" || !version.id) throw new AiPricingError("INVALID_PRICE_VERSION");

  const totalInput = count(usage.inputTokens);
  const output = count(usage.outputTokens);
  // For OpenAI, usage.input_tokens_details is the only authoritative category
  // breakdown. Missing read OR write counts may hide chargeable cache writes.
  if (provider === "openai" &&
      (usage.cachedInputTokens === null || usage.cacheWriteInputTokens === null)) {
    throw new AiPricingError("OPENAI_CACHE_USAGE_UNVERIFIED");
  }
  const cached = usage.cachedInputTokens === null ? 0n : count(usage.cachedInputTokens);
  const cacheWrite = usage.cacheWriteInputTokens === null ? 0n : count(usage.cacheWriteInputTokens);
  // Claude's input tokens exclude cache read/write. Other providers include cached
  // input in inputTokens; Gemini's reported usage must be verified for its model.
  if (provider !== "claude" && provider !== "openai" && cacheWrite !== 0n)
    throw new AiPricingError("UNSUPPORTED_CACHE_WRITE");
  if (provider !== "claude" && cached + cacheWrite > totalInput)
    throw new AiPricingError("CACHE_EXCEEDS_INPUT");
  if (provider === "gemini" && cached !== 0n)
    throw new AiPricingError("GEMINI_CACHE_BILLING_REQUIRES_MODEL_POLICY");
  const ordinaryInput = provider === "claude" ? totalInput : totalInput - cached - cacheWrite;
  const quantities: Record<AiPriceCategory, bigint> = {
    input: ordinaryInput, output, cached_input: cached, cache_write: cacheWrite
  };
  const rates = new Map<AiPriceCategory, bigint>();
  for (const rate of version.rates) {
    if (rates.has(rate.category)) throw new AiPricingError("DUPLICATE_RATE");
    rates.set(rate.category, parseUsdPerMillion(rate.usdPerMillionTokens));
  }
  // Require explicit rates even when a category has zero tokens, to prevent
  // silent free usage when a provider later starts reporting that category.
  for (const category of ["input", "output", "cached_input", "cache_write"] as const) {
    if (!rates.has(category)) throw new AiPricingError("MISSING_RATE");
  }
  if (provider === "gemini" && usage.reasoningOutputTokens !== null &&
      usage.reasoningOutputTokens > usage.outputTokens)
    throw new AiPricingError("THINKING_EXCEEDS_OUTPUT");
  // Provider-specific multimodal/tool fees must be separately priced; no inference.
  const numerator = (Object.keys(quantities) as AiPriceCategory[]).reduce(
    (sum, category) => sum + quantities[category] * rates.get(category)!, 0n);
  const nano = (numerator + MILLION - 1n) / MILLION;
  return {
    pricingVersionId: version.id, provider, model,
    billableTokens: {
      input: Number(ordinaryInput), output: Number(output),
      cached_input: Number(cached), cache_write: Number(cacheWrite)
    },
    costUsdNano: nano.toString()
  };
}
