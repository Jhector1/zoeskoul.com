import type { AiProvider, AiProviderId } from "../types.js";
import { createClaudeProvider } from "./claude.js";
import { createDeepSeekProvider } from "./deepseek.js";
import { createDeepLProvider } from "./deepl.js";
import { createGeminiProvider } from "./gemini.js";
import { createOpenAiProvider } from "./openai.js";

export type CreateAiProviderOptions = {
  provider: AiProviderId;
  model?: string;
};

export function createAiProvider(options: CreateAiProviderOptions): AiProvider {
  switch (options.provider) {
    case "openai":
      return createOpenAiProvider({ model: options.model });
    case "gemini":
      return createGeminiProvider({ model: options.model });
    case "claude":
      return createClaudeProvider({ model: options.model });
    case "deepseek":
      return createDeepSeekProvider({ model: options.model });
    case "deepl":
      return createDeepLProvider({ model: options.model });
    default: {
      const neverProvider: never = options.provider;
      throw new Error(`Unsupported AI provider: ${neverProvider}`);
    }
  }
}
