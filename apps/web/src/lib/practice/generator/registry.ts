import type { TopicContext } from "./generatorTypes";
import type { SubjectModuleGenerator } from "@/lib/practice/generator/engines/utils";
import { makeSubjectGeneratorFromManifest } from "@/lib/practice/generator/engines/json/makeSubjectGeneratorFromManifest";
import { resolveModuleFromTopicSlug } from "@/lib/practice/generator/engines/json/resolveModuleFromTopicSlug";
import {
    SUBJECT_GENERATOR_SOURCES_BY_GENKEY,
    type GeneratedSubjectGenKey,
} from "@/lib/subjects/subjects.generated";

export type TopicGeneratorFactory = (ctx: TopicContext) => SubjectModuleGenerator;

function makeManifestTopicGeneratorFactory(args: {
    sources: (typeof SUBJECT_GENERATOR_SOURCES_BY_GENKEY)[GeneratedSubjectGenKey];
}): TopicGeneratorFactory {
    return (ctx) => {
        const subjectSlug = String(ctx.subjectSlug ?? "").trim();
        const topicSlug = String(ctx.topicSlug ?? "").trim();

        const bySubject =
            subjectSlug.length > 0
                ? args.sources.find((source) => source.subjectSlug === subjectSlug)
                : null;

        const source =
            bySubject ??
            args.sources.find((candidate) =>
                Boolean(
                    resolveModuleFromTopicSlug({
                        manifest: candidate.manifest,
                        topicSlug,
                    }),
                ),
            ) ??
            args.sources[0];

        return makeSubjectGeneratorFromManifest({
            manifest: source.manifest,
            topicManifests: source.topicManifests,
            ctx,
        });
    };
}

const AUTO_TOPIC_GENERATORS = Object.fromEntries(
    Object.entries(SUBJECT_GENERATOR_SOURCES_BY_GENKEY).map(([genKey, source]) => [
        genKey,
        makeManifestTopicGeneratorFactory({
            sources: source,
        }),
    ]),
) as Record<GeneratedSubjectGenKey, TopicGeneratorFactory>;

const MANUAL_TOPIC_GENERATORS: Partial<Record<string, TopicGeneratorFactory>> = {};

export const TOPIC_GENERATORS: Record<string, TopicGeneratorFactory> = {
    ...AUTO_TOPIC_GENERATORS,
    ...MANUAL_TOPIC_GENERATORS,
};
