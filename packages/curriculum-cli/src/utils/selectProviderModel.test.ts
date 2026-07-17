import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveGenerationProviderModel,
  resolveTranslationProviderModel,
} from "./selectProviderModel.js";

const ORIGINAL_ENV = { ...process.env };
const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "AI_MODEL",
  "OPENAI_MODEL",
  "TRANSLATION_PROVIDER",
  "TRANSLATION_MODEL",
  "GEMINI_MODEL",
  "CLAUDE_MODEL",
  "DEEPSEEK_MODEL",
  "DEEPL_MODEL",
] as const;

beforeEach(() => {
  for (const key of AI_ENV_KEYS) {
    delete process.env[key];
  }
});

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

  it("resolves explicit translation provider and model", async () => {
    const resolved = await resolveTranslationProviderModel({
      cliArgs: [
        "--translation-provider",
        "deepseek",
        "--translation-model",
        "deepseek-v4-flash",
      ],
      generation: { provider: "openai", model: "gpt-5-mini" },
      interactive: false,
    });

    expect(resolved).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
  });

  it("defaults translation to generation provider and model when non-interactive", async () => {
    const resolved = await resolveTranslationProviderModel({
      cliArgs: [],
      generation: { provider: "openai", model: "gpt-5-mini" },
      interactive: false,
    });

    expect(resolved).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
    });
  });

  it("lets TRANSLATION_PROVIDER override only translation when non-interactive", async () => {
    process.env.TRANSLATION_PROVIDER = "gemini";
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";

    const resolved = await resolveTranslationProviderModel({
      cliArgs: [],
      generation: { provider: "openai", model: "gpt-5-mini" },
      interactive: false,
    });

    expect(resolved).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
    });
  });

  it("always prompts for generation provider and model in an interactive terminal", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-5-mini";
    process.env.OPENAI_MODEL = "gpt-5-mini";

    const selectProvider = vi.fn(async () => "gemini" as const);
    const selectModel = vi.fn(async () => "gemini-2.5-pro");

    const resolved = await resolveGenerationProviderModel({
      cliArgs: [],
      isTty: true,
      selectProvider,
      selectModel,
    });

    expect(selectProvider).toHaveBeenCalledTimes(1);
    expect(selectModel).toHaveBeenCalledWith("gemini");
    expect(resolved).toEqual({
      provider: "gemini",
      model: "gemini-2.5-pro",
    });
  });

  it("always prompts independently for translation provider and model", async () => {
    process.env.TRANSLATION_PROVIDER = "gemini";
    process.env.TRANSLATION_MODEL = "gemini-2.5-flash-lite";

    const selectProvider = vi.fn(async () => "deepl" as const);
    const selectModel = vi.fn(async () => "deepl-free");

    const resolved = await resolveTranslationProviderModel({
      cliArgs: [],
      generation: { provider: "openai", model: "gpt-5.4-mini" },
      isTty: true,
      selectProvider,
      selectModel,
    });

    expect(selectProvider).toHaveBeenCalledTimes(1);
    expect(selectModel).toHaveBeenCalledWith("deepl");
    expect(resolved).toEqual({
      provider: "deepl",
      model: "deepl-free",
    });
  });

  it("keeps explicit CLI flags non-interactive even in a TTY", async () => {
    const selectProvider = vi.fn(async () => "gemini" as const);
    const selectModel = vi.fn(async () => "gemini-2.5-pro");

    const resolved = await resolveGenerationProviderModel({
      cliArgs: ["--provider", "openai", "--model", "gpt-4o"],
      isTty: true,
      selectProvider,
      selectModel,
    });

    expect(selectProvider).not.toHaveBeenCalled();
    expect(selectModel).not.toHaveBeenCalled();
    expect(resolved).toEqual({ provider: "openai", model: "gpt-4o" });
  });
});
