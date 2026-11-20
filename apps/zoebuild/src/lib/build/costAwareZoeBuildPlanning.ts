import {
  BuildAiPlanningError,
  planBuildProjectFromPrompt,
  type BuildAiPlanner,
  type BuildPromptMedia,
  type PlanBuildProjectFromPromptResult,
} from "@zoeskoul/build-ai";

import {
  profileFromValidatedSpecification,
  resolveBuildModelRoute,
  type BuildModelCandidate,
  type BuildRequestProfile,
  type BuildRoutingMediaKind,
} from "@zoeskoul/build-routing";

import type { ZoeBuildMeteredPlanningContext } from "./meteredZoeBuildPlanning";

import {
  ZoeBuildAiConfigurationError,
  createZoeBuildAiPlannerFromConfig,
  resolveZoeBuildAiConfig,
  type ZoeBuildAiProviderId,
} from "./createZoeBuildAiPlanner";

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
      error.code === "BUILD_AI_SPEC_INVALID"
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
  candidate: BuildModelCandidate,
  index: number,
  metering?: ZoeBuildMeteredPlanningContext,
): BuildAiPlanner {
  if (metering) {
    return {
      async generateProjectSpecification(input) {
        const {createMeteredZoeBuildAttemptPlanner} = await import("./meteredZoeBuildPlanning");
        return createMeteredZoeBuildAttemptPlanner({
          candidate, attemptIndex: index, metering,
        }).generateProjectSpecification(input);
      },
    };
  }
  return createZoeBuildAiPlannerFromConfig({
    provider: candidate.provider as ZoeBuildAiProviderId,
    model: candidate.model,
  });
}

export async function planCostAwareZoeBuildProject(
  input: Readonly<{
    prompt: string;
    media?:
      readonly BuildPromptMedia[];
    /** Server-only, verified per-attempt spend policy. Never browser-sourced. */
    metering?: ZoeBuildMeteredPlanningContext;
  }>,
): Promise<CostAwareBuildPlanResult> {
  // Required-mode gate prevents unmetered provider calls during rollout.
  // The API route must inject verified pricing before switching this on.
  if (process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT === "required" && !input.metering) {
    throw new Error("BUILD_AI_CREDITS_METERING_REQUIRED");
  }
  const mode =
    normalizedRoutingMode();

  const candidates =
    mode === "manual"
      ? [
          manualCandidate(),
        ]
      : resolveBuildModelRoute(
          mediaKinds(input.media),
          { billingEnforced: Boolean(input.metering) },
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

    // The model interprets the original prompt. The existing build-ai parser
    // and stack compatibility gate validate its result without overwriting it.
    const planner = createCandidatePlanner(candidate, index, input.metering);

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
          profile: profileFromValidatedSpecification(plan.specification),
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
