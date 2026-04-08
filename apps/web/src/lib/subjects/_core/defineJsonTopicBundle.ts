import { defineTopicBundle, type GeneratedSubjectTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import type { TopicBundleManifest } from "./manifestTypes";
import { defineJsonGeneratorTopic } from "@/lib/practice/generator/engines/json/defineJsonGeneratorTopic";
import { buildReviewFromManifest } from "./buildReviewFromManifest";
import { buildSketchesFromManifest } from "./buildSketchesFromManifest";

export function defineJsonTopicBundle(
    manifest: TopicBundleManifest,
): GeneratedSubjectTopicBundle {
    const generatorTopic = defineJsonGeneratorTopic(manifest);

    const review = buildReviewFromManifest({
        manifest,
        pool: generatorTopic.pool,
    });

    const sketches = buildSketchesFromManifest(manifest);

    return defineTopicBundle({
        def: review.def,
        review: review.topic,
        sketches,
        generator: generatorTopic,
    });
}