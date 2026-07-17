import {
  mergeManifestIdeServiceConfigs,
  mergeToolPresentationPolicies
} from "@zoeskoul/curriculum-contracts";
import type {
  FullTopicManifest,
  ManifestIdeServiceConfig,
  ManifestRuntimeDefaults,
  SlimTopicManifest,
  ToolPresentationPolicy
} from "@zoeskoul/curriculum-contracts";

export function withTopicParentContext(args: {
  manifest: SlimTopicManifest;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  prefix: string;
  subjectServiceDefaults?: ManifestIdeServiceConfig | null;
  moduleRuntimeDefaults?: ManifestRuntimeDefaults | null;
  moduleServiceDefaults?: ManifestIdeServiceConfig | null;
  sectionServiceDefaults?: ManifestIdeServiceConfig | null;
  subjectTools?: ToolPresentationPolicy | null;
  moduleTools?: ToolPresentationPolicy | null;
  sectionTools?: ToolPresentationPolicy | null;
}): FullTopicManifest {
  return {
    ...args.manifest,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    sectionSlug: args.sectionSlug,
    prefix: args.prefix,
    serviceDefaults: mergeManifestIdeServiceConfigs(
      args.subjectServiceDefaults,
      args.moduleServiceDefaults,
      args.sectionServiceDefaults,
      args.manifest.serviceDefaults
    ),
    runtimeDefaults: args.manifest.runtimeDefaults ?? args.moduleRuntimeDefaults ?? null,
    tools: mergeToolPresentationPolicies(
      args.subjectTools,
      args.moduleTools,
      args.sectionTools,
      args.manifest.tools,
    )
  };
}
