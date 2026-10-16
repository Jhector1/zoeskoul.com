import { createOpenAiJsonTransport } from "@zoeskoul/ai-json";
import {
  createBuildAiPlannerFromJsonTransport,
  type BuildAiPlanner,
} from "@zoeskoul/build-ai";
import {
  createClaudeAiJsonTransport,
  createDeepSeekAiJsonTransport,
  createGeminiAiJsonTransport,
  type AiJsonTransport,
} from "@zoeskoul/ai-json";

export const ZOEBUILD_AI_PROVIDER_IDS = [
  "openai",
  "gemini",
  "claude",
  "deepseek",
] as const;

export type ZoeBuildAiProviderId =
  typeof ZOEBUILD_AI_PROVIDER_IDS[number];

export class ZoeBuildAiConfigurationError extends Error {
  readonly code = "BUILD_AI_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ZoeBuildAiConfigurationError";
  }
}

export function resolveZoeBuildAiConfig(
  env: Readonly<Record<string, string | undefined>>,
): {
  provider: ZoeBuildAiProviderId;
  model: string;
} {
  const provider =
    env.ZOEBUILD_AI_PROVIDER?.trim().toLowerCase();
  const model = env.ZOEBUILD_AI_MODEL?.trim();

  if (
    !provider ||
    !(ZOEBUILD_AI_PROVIDER_IDS as readonly string[]).includes(
      provider,
    )
  ) {
    throw new ZoeBuildAiConfigurationError(
      "ZOEBUILD_AI_PROVIDER must be openai, gemini, claude, or deepseek.",
    );
  }

  if (!model) {
    throw new ZoeBuildAiConfigurationError(
      "ZOEBUILD_AI_MODEL is required.",
    );
  }

  return {
    provider: provider as ZoeBuildAiProviderId,
    model,
  };
}

function createTransport(
  config: ReturnType<typeof resolveZoeBuildAiConfig>,
): AiJsonTransport {
  if (config.provider === "openai") {
    return createOpenAiJsonTransport({
      model: config.model,
      apiKey:
        process.env.OPENAI_API_KEY,
    });
  }


  switch (config.provider) {
    case "gemini":
      return createGeminiAiJsonTransport({
        model: config.model,
      });

    case "claude":
      return createClaudeAiJsonTransport({
        model: config.model,
      });

    case "deepseek":
      return createDeepSeekAiJsonTransport({
        model: config.model,
      });
  }
}

export function createZoeBuildAiPlannerFromConfig(
  config: ReturnType<
    typeof resolveZoeBuildAiConfig
  >,
): BuildAiPlanner {
  return createBuildAiPlannerFromJsonTransport(
    createTransport(config),
  );
}

export function createZoeBuildAiPlanner(): BuildAiPlanner {
  return createZoeBuildAiPlannerFromConfig(
    resolveZoeBuildAiConfig(
      process.env,
    ),
  );
}
