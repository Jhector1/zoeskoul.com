import { afterEach, describe, expect, it } from "vitest";
import {
  resolveGenerationProviderModel,
  resolveTranslationProviderModel,
} from "./selectProviderModel.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("CLI AI provider/model resolution", () => {
  it("resolves explicit generation provider and model", async () => {
    const resolved = await resolveGenerationProviderModel({
      cliArgs: ["--provider", "gemini", "--model", "gemini-2.5-flash-lite"],
      interactive: false,
    });

    expect(resolved).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
    });
  });

  it("resolves explicit translation provider and model", () => {
    const resolved = resolveTranslationProviderModel({
      cliArgs: [
        "--translation-provider",
        "deepseek",
        "--translation-model",
        "deepseek-v4-flash",
      ],
      generation: { provider: "openai", model: "gpt-5-mini" },
    });

    expect(resolved).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
  });

  it("defaults translation to generation provider and model", () => {
    const resolved = resolveTranslationProviderModel({
      cliArgs: [],
      generation: { provider: "openai", model: "gpt-5-mini" },
    });

    expect(resolved).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
    });
  });

  it("lets TRANSLATION_PROVIDER override only translation", () => {
    process.env.TRANSLATION_PROVIDER = "gemini";
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";

    const resolved = resolveTranslationProviderModel({
      cliArgs: [],
      generation: { provider: "openai", model: "gpt-5-mini" },
    });

    expect(resolved).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
    });
  });
});
