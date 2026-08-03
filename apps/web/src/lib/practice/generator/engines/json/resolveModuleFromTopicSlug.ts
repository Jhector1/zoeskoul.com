// src/lib/practice/generator/engines/json/resolveModuleFromTopicSlug.ts
import { parseTopicSlug } from "@/lib/practice/generator/engines/utils";
import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";

export function resolveModuleFromTopicSlug(args: {
    manifest: SubjectManifest;
    topicSlug: string | null | undefined;
}): string | null {
    const { manifest, topicSlug } = args;
    const { base, prefix } = parseTopicSlug(String(topicSlug ?? ""));

    if (prefix) {
        const byPrefix = manifest.modules.find((m) => m.prefix === prefix);
        if (byPrefix) return byPrefix.slug;
    }

    for (const subjectModule of manifest.modules) {
        for (const section of subjectModule.sections) {
            if (section.topics.includes(base)) {
                return subjectModule.slug;
            }
        }
    }

    return null;
}