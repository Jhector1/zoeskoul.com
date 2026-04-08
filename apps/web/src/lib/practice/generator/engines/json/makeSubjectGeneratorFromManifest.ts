// src/lib/practice/generator/engines/json/makeSubjectGeneratorFromManifest.ts
import type { TopicContext } from "@/lib/practice/generator/generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";
import {
    makeNoGenerator,
    makeSubjectModuleGenerator,
} from "@/lib/practice/generator/engines/utils";
import type {
    SubjectManifest,
    TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";
import { buildGeneratorTopicsForModule } from "./buildGeneratorTopicsFromManifest";
import { resolveModuleFromTopicSlug } from "./resolveModuleFromTopicSlug";

export function makeSubjectGeneratorFromManifest(args: {
    manifest: SubjectManifest;
    topicManifests: TopicManifestRefMap;
    ctx: TopicContext;
}): SubjectModuleGenerator {
    const { manifest, topicManifests, ctx } = args;

    const rawTopicSlug = String(ctx.topicSlug ?? "");
    const moduleSlug = resolveModuleFromTopicSlug({
        manifest,
        topicSlug: rawTopicSlug,
    });

    if (!moduleSlug) {
        return makeNoGenerator(manifest.subject.genKey, rawTopicSlug);
    }

    const topics = buildGeneratorTopicsForModule({
        manifest,
        topicManifests,
        moduleSlug,
    });

    return makeSubjectModuleGenerator({
        engineName: `${manifest.subject.genKey}_${moduleSlug}`,
        ctx,
        defaultPurpose: "quiz",
        enablePurpose: true,
        topics,
    });
}