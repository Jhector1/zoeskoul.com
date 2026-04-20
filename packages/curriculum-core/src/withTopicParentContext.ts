import type { FullTopicManifest, SlimTopicManifest } from "@zoeskoul/curriculum-contracts";
import type { ManifestRuntimeDefaults } from "@zoeskoul/curriculum-contracts";

export function withTopicParentContext(args: {
    manifest: SlimTopicManifest;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    moduleRuntimeDefaults?: ManifestRuntimeDefaults | null;
}): FullTopicManifest {
    return {
        ...args.manifest,
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
        prefix: args.prefix,
        runtimeDefaults: args.manifest.runtimeDefaults ?? args.moduleRuntimeDefaults ?? null,
    };
}