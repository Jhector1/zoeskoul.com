/** Provider-reported usage only. Never estimate tokens from prompt length. */
export type AiJsonUsage = Readonly<{
  provider: "openai" | "gemini" | "claude" | "deepseek";
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  reasoningOutputTokens: number | null;
  providerRaw: Readonly<Record<string, unknown>>;
}>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function tokens(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function optionalTokens(value: unknown): number | null {
  return value === undefined || value === null ? null : tokens(value);
}
/** A null result means the provider did not supply complete, valid totals. */
export function normalizeAiJsonUsage(
  provider: AiJsonUsage["provider"], response: unknown,
): AiJsonUsage | null {
  const body = object(response);
  const raw = object(provider === "gemini" ? body?.usageMetadata : body?.usage);
  if (!raw) return null;
  const details = object(provider === "openai" ? raw.input_tokens_details :
    provider === "deepseek" ? raw.prompt_tokens_details : null);
  const outputDetails = object(provider === "openai" ? raw.output_tokens_details :
    provider === "deepseek" ? raw.completion_tokens_details : null);
  const input = tokens(provider === "gemini" ? raw.promptTokenCount :
    provider === "claude" ? raw.input_tokens :
    provider === "openai" ? raw.input_tokens : raw.prompt_tokens);
  const output = tokens(provider === "gemini" ? raw.candidatesTokenCount :
    provider === "claude" ? raw.output_tokens :
    provider === "openai" ? raw.output_tokens : raw.completion_tokens);
  if (input === null || output === null) return null;
  const cached = optionalTokens(provider === "gemini" ? raw.cachedContentTokenCount :
    provider === "claude" ? raw.cache_read_input_tokens :
    details?.cached_tokens);
  // OpenAI Responses reports cache writes separately from cache reads. These
  // are mutually exclusive portions of input_tokens, not additive usage fees.
  const cacheWrite = provider === "openai" ? optionalTokens(details?.cache_write_tokens) :
    provider === "claude" ? optionalTokens(raw.cache_creation_input_tokens) : null;
  const reasoning = optionalTokens(provider === "gemini" ? raw.thoughtsTokenCount : outputDetails?.reasoning_tokens);
  const presentInvalid = (v: unknown) => v !== undefined && v !== null && tokens(v) === null;
  if (presentInvalid(provider === "gemini" ? raw.cachedContentTokenCount :
      provider === "claude" ? raw.cache_read_input_tokens : details?.cached_tokens) ||
      (provider === "openai" && presentInvalid(details?.cache_write_tokens)) ||
      (provider === "claude" && presentInvalid(raw.cache_creation_input_tokens)) ||
      presentInvalid(provider === "gemini" ? raw.thoughtsTokenCount : outputDetails?.reasoning_tokens)) return null;
  // Missing OpenAI read/write counters remain NULL rather than invented zeros;
  // settlement pricing must reject unverified per-category OpenAI accounting.
  // Claude's input_tokens excludes cache-read and cache-creation tokens.
  // Preserve the raw provider semantics; the pricing layer must account for this.
  return { provider, inputTokens: input, outputTokens: output,
    cachedInputTokens: cached, cacheWriteInputTokens: cacheWrite,
    reasoningOutputTokens: reasoning, providerRaw: raw };
}
