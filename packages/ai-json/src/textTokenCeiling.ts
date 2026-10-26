import { AiPricingError, priceAiJsonUsage, type AiPricingVersion } from "./pricing";
import type { AiJsonUsage } from "./usage";

/**
 * E16C4D1 — pure, conservative TEXT-token spending ceiling in USD nanodollars.
 *
 * IMPORTANT: This is arithmetic, NOT a provider token counter or a proven
 * upper bound on any given request. A server may authorize this result only
 * after independently verifying a model-specific upper bound on the total
 * billable input tokens AND a provider-enforced upper bound on all billable
 * output (including hidden/reasoning tokens), plus the absence of other fees.
 * Never infer token budgets from character counts or a browser claim.
 * Provider pricing versions/rates must be independently verified.
 */
export type AiTextTokenCeilingInput = Readonly<{
  provider: AiJsonUsage["provider"];
  model: string;
  occurredAt: string;
  catalog: readonly AiPricingVersion[];
  /** Provider-enforced upper bound on ordinary + cached-read + cached-write input. */
  maxCombinedInputTokens: number;
  /** Provider-enforced upper bound on ALL billable output, including reasoning. */
  maxBillableOutputTokens: number;
}>;

export type AiTextTokenCeiling = Readonly<{
  pricingVersionId: string;
  provider: AiJsonUsage["provider"];
  model: string;
  maxCombinedInputTokens: number;
  maxBillableOutputTokens: number;
  costUsdNano: string;
}>;

export class AiTextTokenCeilingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiTextTokenCeilingError";
  }
}

const MILLION = 1_000_000n;
const MAX_BIGINT_DB = (1n << 63n) - 1n;
function positiveTokenBound(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AiTextTokenCeilingError(`INVALID_${field}`);
  }
  return BigInt(value);
}

/** Select the most expensive possible mutually exclusive input-token category.
 * The upper bound is conservative even when some cache categories are cheaper;
 * it is NOT a recommendation to enable caching on an unverified model.
 */
export function calculateAiTextTokenCeiling(input: AiTextTokenCeilingInput): AiTextTokenCeiling {
  const maxInput = positiveTokenBound(input.maxCombinedInputTokens, "INPUT_CEILING");
  const maxOutput = positiveTokenBound(input.maxBillableOutputTokens, "OUTPUT_CEILING");
  // Gemini thoughts/cached-token billing needs model-specific verification.
  // Blocking here is preferable to silently under-reserving tokens.
  if (input.provider === "gemini") {
    throw new AiTextTokenCeilingError("GEMINI_MODEL_BILLING_POLICY_REQUIRED");
  }
  const provider = input.provider;
  const zero = (): AiJsonUsage => ({
    provider, inputTokens: 0, outputTokens: 0,
    cachedInputTokens: provider === "openai" ? 0 : null,
    cacheWriteInputTokens: provider === "openai" ? 0 : null,
    reasoningOutputTokens: null, providerRaw: {},
  });
  const priceScenario = (kind: "input" | "cached_input" | "cache_write" | "output") => {
    const usage: AiJsonUsage = {
      ...zero(),
      inputTokens: kind === "input" || ((kind === "cached_input" || kind === "cache_write") && provider !== "claude")
        ? 1_000_000 : 0,
      cachedInputTokens: kind === "cached_input" ? 1_000_000 : provider === "openai" ? 0 : null,
      cacheWriteInputTokens: kind === "cache_write" ? 1_000_000 : provider === "openai" ? 0 : null,
      outputTokens: kind === "output" ? 1_000_000 : 0,
    };
    return priceAiJsonUsage({
      usage, provider, model: input.model, occurredAt: input.occurredAt,
      catalog: input.catalog,
    });
  };
  const inputScenarios = [priceScenario("input"), priceScenario("cached_input")];
  // OpenAI cache writes cost MORE than ordinary input on GPT-5.6+ models;
  // excluding this mutually exclusive category would under-reserve credits.
  if (provider === "claude" || provider === "openai") inputScenarios.push(priceScenario("cache_write"));
  const outputScenario = priceScenario("output");
  const versions = [...inputScenarios, outputScenario].map(x => x.pricingVersionId);
  if (versions.some(id => id !== versions[0])) {
    throw new AiPricingError("PRICE_VERSION_NOT_UNIQUE");
  }
  // Exactly one rounding UP for all permitted billable text tokens combined.
  const maxInputRateNanoPerMillion = inputScenarios.reduce((max, candidate) => {
    const cost = BigInt(candidate.costUsdNano);
    return cost > max ? cost : max;
  }, 0n);
  const outputRateNanoPerMillion = BigInt(outputScenario.costUsdNano);
  const costUsdNano = (maxInput * maxInputRateNanoPerMillion +
    maxOutput * outputRateNanoPerMillion + MILLION - 1n) / MILLION;
  if (costUsdNano < 1n) throw new AiTextTokenCeilingError("ZERO_COST_RESERVATION_UNSUPPORTED");
  if (costUsdNano > MAX_BIGINT_DB) throw new AiTextTokenCeilingError("CEILING_OVERFLOW");
  return {
    pricingVersionId: versions[0]!, provider, model: input.model,
    maxCombinedInputTokens: input.maxCombinedInputTokens,
    maxBillableOutputTokens: input.maxBillableOutputTokens,
    costUsdNano: costUsdNano.toString(),
  };
}
