import type {
    FullTopicManifest,
    SlimTopicManifest,
} from "./subjectManifestTypes";
import type { ManifestRuntimeDefaults } from "./manifestTypes";
import {
    type LearningIdeConfig,
    mergeLearningIdeConfigs,
} from "@/lib/ide/learningIdeConfig";
import { mergeManifestRuntimeDefaults } from "./runtimeDefaults";
import {
    mergeToolPresentationPolicies,
    type ToolPresentationPolicy,
} from "@zoeskoul/curriculum-contracts";

export function withTopicParentContext(args: {
    manifest: SlimTopicManifest;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    subjectServiceDefaults?: LearningIdeConfig | null;
    subjectRuntimeDefaults?: ManifestRuntimeDefaults | null;
    moduleRuntimeDefaults?: ManifestRuntimeDefaults | null;
    moduleServiceDefaults?: LearningIdeConfig | null;
    sectionRuntimeDefaults?: ManifestRuntimeDefaults | null;
    sectionServiceDefaults?: LearningIdeConfig | null;
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
        serviceDefaults: mergeLearningIdeConfigs(
            args.subjectServiceDefaults,
            args.moduleServiceDefaults,
            args.sectionServiceDefaults,
            args.manifest.serviceDefaults,
        ),
        runtimeDefaults: mergeManifestRuntimeDefaults(
            args.subjectRuntimeDefaults,
            args.moduleRuntimeDefaults,
            args.sectionRuntimeDefaults,
            args.manifest.runtimeDefaults,
        ),
        tools: mergeToolPresentationPolicies(
            args.subjectTools,
            args.moduleTools,
            args.sectionTools,
            args.manifest.tools,
        ),
    };
}
