import type { AiProviderId, AiModelOption, AiProviderCatalogEntry } from "../types.js";

export const AI_PROVIDER_CATALOG = {
  openai: {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5-mini",
    models: [
      {
        id: "gpt-5-mini",
        label: "GPT-5 mini",
        purpose: "balanced",
        recommendedForTranslation: true,
      },
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 mini",
        purpose: "balanced",
        recommendedForTranslation: true,
      },
      {
        id: "gpt-5.4-nano",
        label: "GPT-5.4 nano",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        purpose: "quality",
      },
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        purpose: "quality",
      },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash-lite",
    models: [
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        purpose: "balanced",
        recommendedForTranslation: true,
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        purpose: "quality",
      },
    ],
  },
  claude: {
    id: "claude",
    label: "Claude",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "CLAUDE_MODEL",
    defaultModel: "claude-sonnet-5",
    models: [
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        purpose: "quality",
        recommendedForTranslation: true,
      },
      {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        purpose: "quality",
      },
      {
        id: "claude-fable-5",
        label: "Claude Fable 5",
        purpose: "balanced",
      },
    ],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-v4-flash",
    models: [
      {
        id: "deepseek-v4-flash",
        label: "DeepSeek V4 Flash",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
      {
        id: "deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        purpose: "quality",
      },
      {
        id: "deepseek-chat",
        label: "deepseek-chat",
        purpose: "legacy",
        deprecated: true,
      },
      {
        id: "deepseek-reasoner",
        label: "deepseek-reasoner",
        purpose: "legacy",
        deprecated: true,
      },
    ],
  },
  deepl: {
    id: "deepl",
    label: "DeepL API Free",
    apiKeyEnv: "DEEPL_API_KEY",
    modelEnv: "DEEPL_MODEL",
    defaultModel: "deepl-free",
    models: [
      {
        id: "deepl-free",
        label: "DeepL API Free",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
      {
        id: "deepl",
        label: "DeepL API default",
        purpose: "balanced",
        recommendedForTranslation: true,
      },
      {
        id: "prefer_quality_optimized",
        label: "DeepL prefer quality optimized",
        purpose: "balanced",
        recommendedForTranslation: true,
      },
      {
        id: "quality_optimized",
        label: "DeepL quality optimized",
        purpose: "quality",
        recommendedForTranslation: true,
      },
      {
        id: "latency_optimized",
        label: "DeepL latency optimized",
        purpose: "cheap",
        recommendedForTranslation: true,
      },
    ],
  },
} satisfies Record<AiProviderId, AiProviderCatalogEntry>;

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDER_CATALOG) as AiProviderId[];

export function isAiProviderId(value: string): value is AiProviderId {
  return value in AI_PROVIDER_CATALOG;
}

export function normalizeAiProviderId(value: string | undefined | null): AiProviderId | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (!isAiProviderId(normalized)) {
    throw new Error(
      `Unknown AI provider "${value}". Supported providers: ${AI_PROVIDER_IDS.join(", ")}`,
    );
  }
  return normalized;
}

export function getAiProviderCatalogEntry(provider: AiProviderId): AiProviderCatalogEntry {
  return AI_PROVIDER_CATALOG[provider];
}

export function getDefaultModelForProvider(provider: AiProviderId): string {
  return getAiProviderCatalogEntry(provider).defaultModel;
}

export function getProviderModelEnv(provider: AiProviderId): string {
  return getAiProviderCatalogEntry(provider).modelEnv;
}

export function resolveModelForProvider(args: {
  provider: AiProviderId;
  cliModel?: string;
  genericModelEnv?: string;
  env?: Record<string, string | undefined>;
}): string {
  const env = args.env ?? process.env;
  const providerEntry = getAiProviderCatalogEntry(args.provider);

  return (
    args.cliModel?.trim() ||
    args.genericModelEnv?.trim() ||
    env[providerEntry.modelEnv]?.trim() ||
    providerEntry.defaultModel
  );
}

export function formatAiModelCatalog(): string {
  const lines: string[] = [];

  for (const providerId of AI_PROVIDER_IDS) {
    const provider = getAiProviderCatalogEntry(providerId);
    lines.push(`${provider.label} (${provider.id})`);
    for (const model of provider.models) {
      const suffix = [
        model.purpose ? model.purpose : "",
        model.recommendedForTranslation ? "translation" : "",
        model.deprecated ? "deprecated" : "",
      ].filter(Boolean).join(", ");

      lines.push(`  - ${model.id}${suffix ? ` (${suffix})` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
