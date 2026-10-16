import {
  BuildAiPlanningError,
  planBuildProjectFromPrompt,
  type BuildAiPlanner,
  type BuildPromptMedia,
  type PlanBuildProjectFromPromptResult,
} from "@zoeskoul/build-ai";

import {
  classifyBuildRequest,
  resolveBuildModelRoute,
  type BuildModelCandidate,
  type BuildRequestProfile,
  type BuildRoutingMediaKind,
} from "@zoeskoul/build-routing";

import {
  ZoeBuildAiConfigurationError,
  createZoeBuildAiPlannerFromConfig,
  resolveZoeBuildAiConfig,
  type ZoeBuildAiProviderId,
} from "./createZoeBuildAiPlanner";

export class BuildArchitectureUnsupportedError
  extends Error {
  readonly code =
    "BUILD_ARCHITECTURE_UNSUPPORTED" as const;

  constructor(
    readonly profile:
      BuildRequestProfile,
  ) {
    super(
      profile.unsupportedReason ??
        "ZoeBuild does not yet have a trusted registered stack for this request.",
    );

    this.name =
      "BuildArchitectureUnsupportedError";
  }
}

export type ZoeBuildAiRoutingAttempt =
  Readonly<{
    provider: string;
    model: string;
    outcome:
      | "success"
      | "provider-unavailable"
      | "validation-failed";
  }>;

export type ZoeBuildAiRoutingMetadata =
  Readonly<{
    mode:
      | "auto"
      | "manual";
    profile:
      BuildRequestProfile;
    selected:
      Readonly<{
        provider: string;
        model: string;
      }>;
    attempts:
      readonly ZoeBuildAiRoutingAttempt[];
  }>;

export type CostAwareBuildPlanResult =
  Readonly<{
    plan:
      PlanBuildProjectFromPromptResult;
    routing:
      ZoeBuildAiRoutingMetadata;
  }>;

function normalizedRoutingMode():
  | "auto"
  | "manual" {
  return (
    process.env
      .ZOEBUILD_AI_ROUTING_MODE
      ?.trim()
      .toLowerCase() ===
    "manual"
  )
    ? "manual"
    : "auto";
}

function hasCredential(
  provider:
    BuildModelCandidate["provider"],
): boolean {
  switch (provider) {
    case "openai":
      return Boolean(
        process.env
          .OPENAI_API_KEY
          ?.trim(),
      );

    case "gemini":
      return Boolean(
        process.env
          .GEMINI_API_KEY
          ?.trim(),
      );

    case "claude":
      return Boolean(
        process.env
          .ANTHROPIC_API_KEY
          ?.trim(),
      );

    case "deepseek":
      return Boolean(
        process.env
          .DEEPSEEK_API_KEY
          ?.trim(),
      );
  }
}

function mediaKinds(
  media:
    readonly BuildPromptMedia[] =
      [],
): BuildRoutingMediaKind[] {
  return Array.from(
    new Set(
      media.map(
        (item) =>
          item.kind,
      ),
    ),
  );
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as Record<
        string,
        unknown
      >
    : {};
}

/**
 * Architecture is deterministic.
 *
 * The model can choose presentation-oriented fields
 * such as name and pages, but it cannot promote a
 * static project to a database app, invent a stack,
 * add commerce/payment mechanics, or alter deployment
 * ownership.
 */
function lockArchitecture(
  planner:
    BuildAiPlanner,
  profile:
    BuildRequestProfile,
): BuildAiPlanner {
  if (
    !profile.supported ||
    !profile.stackId
  ) {
    throw new BuildArchitectureUnsupportedError(
      profile,
    );
  }

  return {
    async generateProjectSpecification(
      input,
    ) {
      const designContext = [
        input.prompt,
        "",
        "ZoeBuild has already selected the application architecture.",
        "Do not redesign or replace the architecture.",
        `Site kind: ${profile.siteKind}.`,
        `Industry: ${profile.industry ?? "unspecified"}.`,
        `Complexity: ${profile.complexity}.`,
        "",
        "AI responsibilities:",
        ...profile
          .dynamicResponsibilities
          .map(
            (item) =>
              `- ${item}`,
          ),
        "",
        "Deterministic responsibilities that must not be invented or replaced:",
        ...profile
          .staticResponsibilities
          .map(
            (item) =>
              `- ${item}`,
          ),
      ].join("\n");

      const generated =
        await planner
          .generateProjectSpecification({
            ...input,
            prompt:
              designContext,
          });

      const modelSpecification =
        asRecord(
          generated.specification,
        );

      return {
        ...generated,

        specification: {
          ...modelSpecification,

          projectType:
            profile.projectType,

          targets: [
            ...profile.targets,
          ],

          requirements: {
            ...profile.requirements,
          },

          commerce:
            profile.commerce,

          stackId:
            profile.stackId,

          deployment: {
            preference:
              profile.deploymentPreference,
          },
        },
      };
    },
  };
}

function providerFailureStatus(
  error: unknown,
): number | null {
  if (
    typeof error ===
      "object" &&
    error !== null &&
    "status" in error &&
    typeof (
      error as {
        status?: unknown;
      }
    ).status ===
      "number"
  ) {
    return (
      error as {
        status: number;
      }
    ).status;
  }

  return null;
}

function isRetryableProviderFailure(
  error: unknown,
): boolean {
  const status =
    providerFailureStatus(
      error,
    );

  if (
    status === 429 ||
    (
      status !== null &&
      status >= 500 &&
      status <= 599
    )
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
          .toLowerCase()
      : String(error)
          .toLowerCase();

  return (
    message.includes(
      "high demand",
    ) ||
    message.includes(
      "unavailable",
    ) ||
    message.includes(
      "temporar",
    ) ||
    message.includes(
      "rate limit",
    ) ||
    /\((429|5\d\d)\)/.test(
      message,
    )
  );
}

function shouldEscalate(
  error: unknown,
): boolean {
  if (
    error instanceof
    BuildAiPlanningError
  ) {
    return (
      error.code ===
        "BUILD_AI_SPEC_INVALID" ||
      error.code ===
        "BUILD_AI_STACK_INCOMPATIBLE"
    );
  }

  return isRetryableProviderFailure(
    error,
  );
}

function manualCandidate():
  BuildModelCandidate {
  const config =
    resolveZoeBuildAiConfig(
      process.env,
    );

  return {
    provider:
      config.provider,
    model:
      config.model,
    tier: "strong",
    reason:
      "Explicit manual ZoeBuild provider/model override.",
  };
}

function createCandidatePlanner(
  candidate:
    BuildModelCandidate,
): BuildAiPlanner {
  return createZoeBuildAiPlannerFromConfig({
    provider:
      candidate.provider as ZoeBuildAiProviderId,
    model:
      candidate.model,
  });
}

export async function planCostAwareZoeBuildProject(
  input: Readonly<{
    prompt: string;
    media?:
      readonly BuildPromptMedia[];
  }>,
): Promise<CostAwareBuildPlanResult> {
  const profile =
    classifyBuildRequest(
      input.prompt,
    );

  if (
    !profile.supported ||
    !profile.stackId
  ) {
    // Deliberately occurs before any provider call.
    throw new BuildArchitectureUnsupportedError(
      profile,
    );
  }

  const mode =
    normalizedRoutingMode();

  const candidates =
    mode === "manual"
      ? [
          manualCandidate(),
        ]
      : resolveBuildModelRoute(
          profile,
          mediaKinds(
            input.media,
          ),
        ).candidates.filter(
          (candidate) =>
            hasCredential(
              candidate.provider,
            ),
        );

  if (
    candidates.length === 0
  ) {
    throw new ZoeBuildAiConfigurationError(
      "No configured ZoeBuild AI provider can handle this request.",
    );
  }

  const attempts:
    ZoeBuildAiRoutingAttempt[] =
      [];

  let lastError:
    unknown = null;

  for (
    let index = 0;
    index < candidates.length;
    index += 1
  ) {
    const candidate =
      candidates[index];

    const planner =
      lockArchitecture(
        createCandidatePlanner(
          candidate,
        ),
        profile,
      );

    try {
      const plan =
        await planBuildProjectFromPrompt({
          prompt:
            input.prompt,
          media:
            input.media,
          planner,
        });

      attempts.push({
        provider:
          candidate.provider,
        model:
          candidate.model,
        outcome:
          "success",
      });

      return {
        plan,
        routing: {
          mode,
          profile,
          selected: {
            provider:
              candidate.provider,
            model:
              candidate.model,
          },
          attempts,
        },
      };
    } catch (error) {
      lastError = error;

      const retry =
        mode === "auto" &&
        shouldEscalate(
          error,
        ) &&
        index <
          candidates.length - 1;

      attempts.push({
        provider:
          candidate.provider,
        model:
          candidate.model,
        outcome:
          error instanceof
          BuildAiPlanningError
            ? "validation-failed"
            : "provider-unavailable",
      });

      if (!retry) {
        throw error;
      }
    }
  }

  throw (
    lastError ??
    new Error(
      "ZoeBuild AI routing exhausted without a result.",
    )
  );
}
