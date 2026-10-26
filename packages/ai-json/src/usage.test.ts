import { describe, expect, it } from "vitest";
import { normalizeAiJsonUsage } from "./usage";
describe("provider-reported usage", () => {
  it("reads OpenAI cache and reasoning", () => {
    expect(normalizeAiJsonUsage("openai", {usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:60,cache_write_tokens:30},output_tokens_details:{reasoning_tokens:5}}})).toMatchObject({inputTokens:100,outputTokens:20,cachedInputTokens:60,cacheWriteInputTokens:30,reasoningOutputTokens:5});
  });
  it("preserves absent OpenAI cache counters as unknown and refuses invalid counter values", () => {
    expect(normalizeAiJsonUsage("openai", {usage:{input_tokens:100,output_tokens:20,
      input_tokens_details:{cached_tokens:5}}})).toMatchObject({
        cachedInputTokens:5, cacheWriteInputTokens:null,
      });
    expect(normalizeAiJsonUsage("openai", {usage:{input_tokens:100,output_tokens:20,
      input_tokens_details:{cached_tokens:5,cache_write_tokens:-1}}})).toBeNull();
    expect(normalizeAiJsonUsage("openai", {usage:{input_tokens:100,output_tokens:20,
      input_tokens_details:{cached_tokens:5,cache_write_tokens:"50"}}})).toBeNull();
  });
  it("reads Gemini cache and thoughts", () => {
    expect(normalizeAiJsonUsage("gemini", {usageMetadata:{promptTokenCount:90,candidatesTokenCount:10,cachedContentTokenCount:40,thoughtsTokenCount:3}})).toMatchObject({inputTokens:90,outputTokens:10,cachedInputTokens:40,reasoningOutputTokens:3});
  });
  it("keeps Claude cache writes distinct", () => {
    expect(normalizeAiJsonUsage("claude", {usage:{input_tokens:10,output_tokens:20,cache_read_input_tokens:80,cache_creation_input_tokens:30}})).toMatchObject({inputTokens:10,outputTokens:20,cachedInputTokens:80,cacheWriteInputTokens:30});
  });
  it("reads DeepSeek cache hits", () => {
    expect(normalizeAiJsonUsage("deepseek", {usage:{prompt_tokens:100,completion_tokens:12,prompt_tokens_details:{cached_tokens:80}}})).toMatchObject({inputTokens:100,outputTokens:12,cachedInputTokens:80});
  });
  it("never invents missing or invalid totals", () => {
    expect(normalizeAiJsonUsage("openai", {})).toBeNull();
    expect(normalizeAiJsonUsage("gemini", {usageMetadata:{promptTokenCount:5}})).toBeNull();
    expect(normalizeAiJsonUsage("claude", {usage:{input_tokens:-1,output_tokens:1}})).toBeNull();
  });
});
