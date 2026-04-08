// src/lib/subjects/_core/withTopicParentContext.ts
import type {
    FullTopicManifest,
    SlimTopicManifest,
} from "./subjectManifestTypes";

export function withTopicParentContext(args: {
    manifest: SlimTopicManifest;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
}): FullTopicManifest {
    return {
        ...args.manifest,
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
        prefix: args.prefix,
    };
}