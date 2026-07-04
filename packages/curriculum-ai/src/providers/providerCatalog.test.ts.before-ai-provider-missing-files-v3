import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_CATALOG,
  AI_PROVIDER_IDS,
  formatAiModelCatalog,
  getDefaultModelForProvider,
  normalizeAiProviderId,
  resolveModelForProvider,
} from "./providerCatalog.js";

describe("AI provider catalog", () => {
  it("registers the supported provider ids with defaults", () => {
    expect(AI_PROVIDER_IDS).toEqual(["openai", "gemini", "claude", "deepseek"]);

    for (const providerId of AI_PROVIDER_IDS) {
      const entry = AI_PROVIDER_CATALOG[providerId];
      expect(entry.defaultModel).toBeTruthy();
      expect(entry.models.map((model) => model.id)).toContain(entry.defaultModel);
    }
  });

  it("prints provider-specific model lists", () => {
    const text = formatAiModelCatalog();

    expect(text).toContain("OpenAI (openai)");
    expect(text).toContain("gpt-5-mini");
    expect(text).toContain("Gemini (gemini)");
    expect(text).toContain("gemini-2.5-flash-lite");
    expect(text).toContain("Claude (claude)");
    expect(text).toContain("claude-sonnet-5");
    expect(text).toContain("DeepSeek (deepseek)");
    expect(text).toContain("deepseek-v4-flash");
  });

  it("resolves model by cli, generic env, provider env, then default", () => {
    expect(resolveModelForProvider({
      provider: "gemini",
      cliModel: "custom-gemini",
      env: {},
    })).toBe("custom-gemini");

    expect(resolveModelForProvider({
      provider: "gemini",
      genericModelEnv: "generic-model",
      env: { GEMINI_MODEL: "provider-model" },
    })).toBe("generic-model");

    expect(resolveModelForProvider({
      provider: "gemini",
      env: { GEMINI_MODEL: "provider-model" },
    })).toBe("provider-model");

    expect(resolveModelForProvider({
      provider: "gemini",
      env: {},
    })).toBe(getDefaultModelForProvider("gemini"));
  });

  it("rejects unknown provider ids", () => {
    expect(() => normalizeAiProviderId("bogus")).toThrow(/Unknown AI provider/);
  });
});
