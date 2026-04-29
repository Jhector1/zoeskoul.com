import type {
    FullTopicManifest,
    SlimTopicManifest,
} from "./subjectManifestTypes";
import type { ManifestRuntimeDefaults } from "./manifestTypes";
import {
    type LearningIdeConfig,
    mergeLearningIdeConfigs,
} from "@/lib/ide/learningIdeConfig";

export function withTopicParentContext(args: {
    manifest: SlimTopicManifest;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    subjectServiceDefaults?: LearningIdeConfig | null;
    moduleRuntimeDefaults?: ManifestRuntimeDefaults | null;
    moduleServiceDefaults?: LearningIdeConfig | null;
    sectionServiceDefaults?: LearningIdeConfig | null;
}): FullTopicManifest {
    return {
        ...args.manifest,
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
        prefix: args.prefix,
        serviceDefaults: mergeLearningIdeConfigs(
            args.subjectServiceDefaults,
            args.moduleServiceDefaults,
            args.sectionServiceDefaults,
            args.manifest.serviceDefaults,
        ),
        runtimeDefaults: args.manifest.runtimeDefaults ?? args.moduleRuntimeDefaults ?? null,
    };
}
