import {
  mergeManifestIdeServiceConfigs
} from "@zoeskoul/curriculum-contracts";
import type {
  FullTopicManifest,
  ManifestIdeServiceConfig,
  ManifestRuntimeDefaults,
  SlimTopicManifest
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
    runtimeDefaults: args.manifest.runtimeDefaults ?? args.moduleRuntimeDefaults ?? null
  };
}
