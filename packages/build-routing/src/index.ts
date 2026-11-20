import type { ProjectSpecification } from "@zoeskoul/build-contracts";

export type BuildRoutingProvider =
  | "openai"
  | "gemini"
  | "claude"
  | "deepseek";

export type BuildRoutingMediaKind =
  | "image"
  | "audio"
  | "video";

export type BuildModelCandidate =
  Readonly<{
    provider: BuildRoutingProvider;
    model: string;
    tier:
      | "economy"
      | "balanced"
      | "strong";
    reason: string;
  }>;

/** Architecture metadata comes exclusively from a parsed and validated model plan.
 * There is no application-kind classifier and no prompt text in model routing.
 */
export type BuildRequestProfile = Readonly<{
  projectType: ProjectSpecification["projectType"];
  targets: ProjectSpecification["targets"];
  requirements: ProjectSpecification["requirements"];
  commerce: ProjectSpecification["commerce"];
  stackId: string;
  deploymentPreference: ProjectSpecification["deployment"]["preference"];
}>;

export function profileFromValidatedSpecification(specification: ProjectSpecification): BuildRequestProfile {
  return {
    projectType: specification.projectType,
    targets: specification.targets,
    requirements: specification.requirements,
    commerce: specification.commerce ?? null,
    stackId: specification.stackId,
    deploymentPreference: specification.deployment.preference,
  };
}

export type BuildModelRoute = Readonly<{
  strategy: "quality-first" | "cost-aware";
  candidates: readonly BuildModelCandidate[];
}>;

/** Technical transport selection only. Never classify or interpret user text.
 * Local/default use prefers the stronger existing model configuration.
 * Required billing retains the prior ordinary candidate order; the
 * server's independent billing approvals still decide whether dispatch is legal.
 */
export function resolveBuildModelRoute(
  mediaKinds: readonly BuildRoutingMediaKind[] = [],
  options: Readonly<{ billingEnforced?: boolean }> = {},
): BuildModelRoute {
  const strong: BuildModelCandidate = {
    provider: "openai", model: "gpt-6.1-sol", tier: "strong",
    reason: "Prefer strong reasoning for open-ended application requests.",
  };
  const balanced: BuildModelCandidate = {
    provider: "gemini", model: "gemini-3.8-flash", tier: "balanced",
    reason: "Existing cross-provider model for complex and multimodal work.",
  };
  const openaiEconomy: BuildModelCandidate = {
    provider: "openai", model: "gpt-6-luna", tier: "economy",
    reason: "Existing alternative text/image model.",
  };
  const geminiEconomy: BuildModelCandidate = {
    provider: "gemini", model: "gemini-3.1-flash-lite", tier: "economy",
    reason: "Existing alternative multimodal model.",
  };
  const audiovisual = mediaKinds.some(kind => kind === "audio" || kind === "video");
  return options.billingEnforced ? {
    strategy: "cost-aware",
    candidates: audiovisual ? [geminiEconomy, balanced] : [openaiEconomy, geminiEconomy, strong],
  } : {
    strategy: "quality-first",
    candidates: audiovisual ? [balanced, geminiEconomy] : [strong, balanced, openaiEconomy, geminiEconomy],
  };
}
