// src/lib/practice/generator/engines/json/buildGeneratorTopicsFromManifest.ts
import type { TopicBundle } from "@/lib/practice/generator/engines/utils";
import { defineJsonGeneratorTopic } from "@/lib/practice/generator/engines/json/defineJsonGeneratorTopic";
import { withTopicParentContext } from "@/lib/subjects/_core/withTopicParentContext";
import type {
    SubjectManifest,
    TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

export function buildGeneratorTopicsForModule(args: {
    manifest: SubjectManifest;
    topicManifests: TopicManifestRefMap;
    moduleSlug: string;
}): TopicBundle[] {
    const { manifest, topicManifests, moduleSlug } = args;

    const moduleManifest = manifest.modules.find((m) => m.slug === moduleSlug);
    if (!moduleManifest) {
        throw new Error(`Unknown module slug "${moduleSlug}"`);
    }

    return moduleManifest.sections.flatMap((section) =>
        section.topics.map((topicId) => {
            const topicManifest = topicManifests[topicId];
            if (!topicManifest) {
                throw new Error(
                    `Missing topic manifest "${topicId}" for module "${moduleSlug}"`,
                );
            }

            const fullManifest = withTopicParentContext({
                manifest: topicManifest,
                subjectSlug: manifest.subject.slug,
                moduleSlug: moduleManifest.slug,
                sectionSlug: section.slug,
                prefix: moduleManifest.prefix,
                subjectServiceDefaults: manifest.subject.serviceDefaults ?? null,
                moduleRuntimeDefaults: moduleManifest.runtimeDefaults ?? null,
                moduleServiceDefaults: moduleManifest.serviceDefaults ?? null,
                sectionServiceDefaults: section.serviceDefaults ?? null,
            });

            return defineJsonGeneratorTopic(fullManifest);
        }),
    );
}
